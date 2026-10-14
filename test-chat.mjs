
import fetch from "node-fetch";
import { db } from "./src/server/db/index.js";
import { schema } from "./src/server/db/index.js";

async function testChat() {
  console.log("Fetching a valid session...");
  // Find any valid session
  const result = await db.select().from(schema.sessions).limit(1);
  if (result.length === 0) {
    console.error("No valid sessions found in DB!");
    process.exit(1);
  }
  
  const sessionId = result[0].id;
  console.log("Using session id:", sessionId);

  console.log("Making request to /api/chat...");
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `mediflow_session=${sessionId}`
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Check interaction: Ibuprofen and Aspirin" }]
    })
  });

  console.log("Response status:", res.status);
  const text = await res.text();
  console.log("Response body:");
  console.log(text);
  
  process.exit(0);
}

testChat().catch(console.error);

