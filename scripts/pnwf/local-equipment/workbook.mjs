import { rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sheetName = "设备评审";

async function load(path) {
  return SpreadsheetFile.importXlsx(await FileBlob.load(path));
}

export async function createWorkbook(path, previewPath) {
  const book = Workbook.create();
  const sheet = book.worksheets.add(sheetName);
  sheet.showGridLines = false;
  sheet.getRange("A2:E6").values = [
    ["工位设备评审", null, null, null, null],
    [null, null, null, null, null],
    ["设备", "建议", "状态", "联机实测（分钟）", "依据"],
    ["便携记录器", "A", "上一版", null, "供应商资料"],
    ["扫码枪", "沿用", "可用", null, "现场清点 P-07"],
  ];
  sheet.getRange("A2:E6").format.font.name = "Microsoft YaHei";
  sheet.getRange("A2:E6").format.font.size = 10;
  sheet.getRange("A2").format.font.size = 14;
  sheet.getRange("A2").format.font.bold = true;
  sheet.getRange("A4:E4").format.fill = "#253649";
  sheet.getRange("A4:E4").format.font.color = "#FFFFFF";
  sheet.getRange("A4:E4").format.font.bold = true;
  sheet.getRange("A4:E4").format.horizontalAlignment = "center";
  sheet.getRange("A4:E6").format.rowHeight = 24;
  sheet.getRange("A:A").format.columnWidth = 18;
  sheet.getRange("B:C").format.columnWidth = 12;
  sheet.getRange("D:D").format.columnWidth = 24;
  sheet.getRange("E:E").format.columnWidth = 62;
  sheet.getRange("D5:D6").setNumberFormat("0");
  book.recalculate();
  await (await SpreadsheetFile.exportXlsx(book)).save(path);
  if (previewPath) {
    const preview = await book.render({ sheetName, range: "A1:E7", scale: 1, format: "png" });
    await writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
  }
}

export async function readWorkbook(path) {
  const book = await load(path);
  const rows = book.worksheets.getItem(sheetName).getRange("A5:E6").values;
  return { logger: rows[0], scanner: rows[1] };
}

export async function editWorkbook(path, { choice, status, minutes, evidence }) {
  const book = await load(path);
  book.worksheets.getItem(sheetName).getRange("B5:E5").values = [[choice, status, minutes, evidence]];
  book.recalculate();
  const temporary = path + "." + randomUUID() + ".xlsx";
  try {
    await (await SpreadsheetFile.exportXlsx(book)).save(temporary);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
    await rm(temporary + ".inspect.ndjson", { force: true });
  }
}
