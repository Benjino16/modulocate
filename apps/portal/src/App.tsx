import { useEffect, useState } from "react";
import { trpcClient } from "./trpc";

function App() {
  const [status, setStatus] = useState("loading...");

  useEffect(() => {
    trpcClient.health.query().then((res) => {
      setStatus(res.status);
    });
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>modulocate — portal</h1>
      <p>Backend status: <strong>{status}</strong></p>
    </div>
  );
}

export default App;