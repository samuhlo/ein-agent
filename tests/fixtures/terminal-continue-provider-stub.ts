import { stdin, stdout } from "node:process";

const provider = process.argv[2] === "claude" ? "claude" : "pi";
const expected = "\u001b[200~PRIVATE-BRIEF-CANARY\u001b[201~\r";
let input = "";
let delivered = false;

stdin.setRawMode?.(true);
const onInput = (chunk: Buffer | string): void => {
  input += chunk.toString();
  if (!delivered && !expected.startsWith(input) && !input.startsWith(expected)) process.exit(4);
  if (!delivered && input.startsWith(expected)) {
    delivered = true;
    input = input.slice(expected.length);
    stdout.write(`DELIVERED:${provider}\n`);
  }
  if (delivered && input.includes("x")) process.exit(provider === "pi" ? 6 : 8);
};
stdout.write("\u001b[?20");
stdout.write("04h");
setImmediate(() => {
  stdin.on("data", onInput);
  stdin.resume();
});
