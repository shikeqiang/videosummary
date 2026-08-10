  const crypto = require("crypto")
  const fs = require("fs")

  // ==== 改这里 ↓↓ ====
  const PADDLE_SIG_HEADER = "ts=1786246954;h1=PASTE_REAL_H1_HERE"
  const BODY = `PASTE_REAL_BODY_JSON_HERE`
  // ==== 改这里 ↑↑ ====

  const env = fs.readFileSync(__dirname + "/.env.local", "utf8")
  const m = env.match(/^PADDLE_WEBHOOK_SECRET=(.*)$/m)
  if (!m) { console.error(".env.local 找不到 PADDLE_WEBHOOK_SECRET"); process.exit(1) }
  const secret = m[1].trim()

  const sig = PADDLE_SIG_HEADER.match(/ts=(\d+);h1=([a-f0-9]+)/)
  if (!sig) { console.error("PADDLE_SIG_HEADER 格式不对"); process.exit(1) }
  const ts = sig[1]
  const h1_paddle = sig[2]

  const secHash = crypto.createHash("sha256").update(secret).digest("hex")
  const toSign = `${ts}.${BODY}`
  const expected = crypto.createHmac("sha256", secret).update(toSign, "utf8").digest("hex")

  console.log("==========  DIAG  ==========")
  console.log("secret  length:", secret.length)
  console.log("secret  sha256:", secHash)
  console.log("secret  preview:", secret.slice(0, 4) + "…" + secret.slice(-4))
  console.log("")
  console.log("body    length:", BODY.length)
  console.log("body    sha256:", crypto.createHash("sha256").update(BODY).digest("hex"))
  console.log("")
  console.log("expected h1:   ", expected)
  console.log("paddle  h1:    ", h1_paddle)
  console.log("match:         ", expected === h1_paddle ? "YES ✅" : "NO ❌")
  console.log("===========================")
