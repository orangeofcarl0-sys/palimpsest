import assert from "node:assert/strict";

function choose(facts, measurement) {
  assert.equal(measurement.condition, facts.requirement.condition);
  const ranked = Object.entries(facts.prices).sort((left, right) => left[1] - right[1]);
  const eligible = ranked.find(([id]) => measurement.minutes[id] >= facts.requirement.minimumMinutes);
  assert(eligible, "no adequately measured candidate");
  return { choice: eligible[0], status: "建议", minutes: measurement.minutes[eligible[0]], evidence: measurement.id };
}

function toolResult(input, id) {
  const result = input.messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .findLast((block) => block.type === "tool_result" && block.tool_use_id === id);
  assert(result && !result.is_error, "mock did not receive a successful actual tool result for " + id);
  const content = typeof result.content === "string" ? result.content : result.content.map((block) => block.text).join("");
  return JSON.parse(content);
}

/** Same behavior in both arms. Choices use the observed condition, draft and receipt. */
export function equipmentReply(file, onPending, trace) {
  let step = "start";
  let facts, original, received, last;
  return async (input, ordinal) => {
    const result = last === undefined ? undefined : toolResult(input, last.id);
    if (last !== undefined) last.result = result;
    function call(name, args, next) {
      const record = { type: "tool_use", id: "equipment_" + (ordinal + 1), name, input: args };
      last = { id: record.id, name, args };
      trace.push(last);
      step = next;
      return [record];
    }
    const equipment = (action, args, next) => call("equipment_review", { action, ...args }, next);
    const asset = (action, args, next) => call("palimpsest_asset_checkpoint", { action, path: file, ...args }, next);
    const finish = (text) => [{ type: "text", text }];
    switch (step) {
      case "start":
        return equipment("inspect", {}, "observed");
      case "observed":
        facts = result.facts;
        if (result.draft === null) {
          assert(result.checkpoint && result.review?.state === "PENDING");
          original = result.review;
          return asset("restore", { checkpointId: result.checkpoint.id }, "restored");
        }
        if (facts.measurement.condition === facts.requirement.condition) {
          return equipment("write_recommendation", choose(facts, facts.measurement), "written_direct");
        }
        return equipment("write_recommendation", {
          choice: result.draft.logger[1], status: "待复核", minutes: null, evidence: facts.measurement.id,
        }, "written_pending");
      case "written_direct":
        return asset("save", {}, "direct_saved");
      case "direct_saved":
        return finish("评审草案已更新，现有联机实测足以给出建议。");
      case "written_pending":
        return asset("save", {}, "saved_pending");
      case "saved_pending":
        return equipment("request_review", {
          checkpointId: result.id,
          question: "现有供应商记录是独立工作工况。请核对 A、B 在联机采集工况下的连续工作时间。",
        }, "asked");
      case "asked":
        assert.equal(result.state, "PENDING");
        return finish("已保存初稿，等待联机续航核对。");
      case "restored":
        return equipment("inspect", {}, "pending_seen");
      case "pending_seen":
        assert(result.draft.digest === result.checkpoint.digest && result.review.id === original.id);
        await onPending(result.review);
        return equipment("read_receipt", { requestId: original.id, checkpointId: original.checkpointId }, "receipt_seen");
      case "receipt_seen":
        received = result.receipt;
        assert(received && received.checkpointId === original.checkpointId);
        return equipment("write_recommendation", {
          ...choose(facts, received.measurement), evidence: received.id,
        }, "revised");
      case "revised":
        return asset("save", {}, "revised_saved");
      case "revised_saved":
        return equipment("resolve_review", { requestId: original.id, receiptId: received.id }, "resolved");
      case "resolved":
        assert.equal(result.state, "RESOLVED");
        return finish("已按联机实测更新设备建议并写回依据，草案可供所有者审阅。");
      default:
        throw new Error("unknown equipment mock step");
    }
  };
}
