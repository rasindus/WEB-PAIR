const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

function removeFile(FilePath) {
  if (fs.existsSync(FilePath)) {
    fs.rmSync(FilePath, { recursive: true, force: true });
  }
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.send({ error: "Number is required" });

  async function RobinPair() {
    // පරණ සෙෂන් තිබේ නම් ඒවා ඉවත් කර අලුතින්ම පටන් ගැනීම
    removeFile("./session");
    
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    
    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        // Browser එක Chrome ලෙස සැකසීම වඩාත් ස්ථාවරයි
        browser: ["Chrome (Linux)", "Chrome", "1.0.0"], 
      });

      // Pairing Code එක ඉල්ලීම
      if (!RobinPairWeb.authState.creds.registered) {
        await delay(3000); // සර්වර් එක සූදානම් වීමට තත්පර 3ක විරාමයක්
        num = num.replace(/[^0-9]/g, "");
        
        try {
          const code = await RobinPairWeb.requestPairingCode(num);
          if (!res.headersSent) {
            await res.send({ code });
          }
        } catch (error) {
          console.error("Error requesting pairing code:", error);
          if (!res.headersSent) res.send({ code: "Error requesting code" });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);
      
      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          try {
            await delay(5000); // සම්බන්ධ වූ පසු දත්ත Save වීමට කාලය දීම
            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            // Mega එකට Upload කිරීමේ කොටස
            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${Math.random().toString(36).substring(2, 10)}.json`
            );

            const string_session = mega_url.replace("https://mega.nz/file/", "");
            
            const welcomeMsg = `*ROBIN BOT CONNECTED*\n\nSession ID: \`${string_session}\`\n\nමෙම ID එක config.js එකට ඇතුළත් කරන්න.`;

            // පරිශීලකයාට තොරතුරු යැවීම
            await RobinPairWeb.sendMessage(user_jid, { text: string_session });
            await RobinPairWeb.sendMessage(user_jid, { 
                image: { url: "https://raw.githubusercontent.com/Dark-Robin/Bot-Helper/refs/heads/main/autoimage/Bot%20robin%20WP.jpg" },
                caption: welcomeMsg 
            });

            console.log("Session Successful!");
            await delay(2000);
            removeFile("./session"); // ආරක්ෂාව සඳහා සෙෂන් ෆෝල්ඩරය මැකීම
          } catch (e) {
            console.log("Error in open connection:", e);
          }
        } 
        
        if (connection === "close") {
          let reason = lastDisconnect?.error?.output?.statusCode;
          if (reason !== 401) { // 401 යනු Logged Out වීමයි
             // අවශ්‍ය නම් මෙතනදී නැවත සම්බන්ධ වීමට උත්සාහ කළ හැක
          }
        }
      });

    } catch (err) {
      console.log("Service Error:", err);
      if (!res.headersSent) res.send({ code: "Service Unavailable" });
    }
  }
  
  return await RobinPair();
});

module.exports = router;
