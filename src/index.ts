import { createServer } from "./http/server";

const PORT = Number(process.env.PORT ?? 3000);

const app = createServer();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Sequential AI Chat server running on http://localhost:${PORT}`);
});
