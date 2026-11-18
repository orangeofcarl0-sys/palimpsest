import { readFileSync } from "node:fs";
const lines=readFileSync(new URL("../operations/dashboard.csv",import.meta.url),"utf8").trim().split(/\r?\n/);
const failures=lines.slice(1).filter(line=>line.split(",")[1]==="grpc_error").reduce((n,line)=>n+Number(line.split(",")[2]),0);
console.log(JSON.stringify({edgeErrors:failures,decision:failures?"hold":"continue"}));
