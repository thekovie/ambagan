import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

/**
 * A minimal SMTP server over implicit TLS that accepts every message and writes it to `mailDir` as NNN.eml.
 * It lets the end-to-end test read what the app really emailed (through nodemailer, over TLS) without a mail
 * provider. It speaks just enough SMTP: EHLO, MAIL, RCPT, DATA, RSET, NOOP, QUIT.
 */
export function startSmtpSink(options: { port: number; mailDir: string; keyFile: string; certFile: string }): Promise<() => Promise<void>> {
  const { port, mailDir, keyFile, certFile } = options;
  fs.mkdirSync(mailDir, { recursive: true });
  let counter = fs.readdirSync(mailDir).length;

  const server = tls.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, (socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 sink ESMTP\r\n");

    /** Writes the message once its terminating "<CRLF>.<CRLF>" has arrived. Returns false while it is incomplete. */
    const finishData = (): boolean => {
      const end = buffer.indexOf("\r\n.\r\n");
      if (end === -1) return false;
      counter += 1;
      fs.writeFileSync(path.join(mailDir, `${String(counter).padStart(3, "0")}.eml`), buffer.slice(0, end).replace(/^\.\./gm, "."));
      buffer = buffer.slice(end + 5);
      inData = false;
      socket.write("250 queued\r\n");
      return true;
    };

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          if (!finishData()) return;
          continue;
        }
        const newline = buffer.indexOf("\r\n");
        if (newline === -1) return;
        const command = buffer.slice(0, 4).toUpperCase();
        buffer = buffer.slice(newline + 2);
        if (command === "EHLO" || command === "HELO") socket.write("250 sink\r\n");
        else if (command === "DATA") {
          socket.write("354 go ahead\r\n");
          inData = true;
        } else if (command === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
          return;
        } else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => socket.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(() => new Promise<void>((done) => server.close(() => done()))));
  });
}
