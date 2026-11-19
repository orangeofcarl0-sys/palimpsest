import {readFileSync} from "node:fs";
import {departures} from "./board.mjs";
const [stop="River", time="2025-07-05T00:00:00Z", minutes="30"] = process.argv.slice(2);
const feed=JSON.parse(readFileSync(new URL("./feed.json",import.meta.url)));
console.log(JSON.stringify(departures(feed,stop,time,Number(minutes)),null,2));
