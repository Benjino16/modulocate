import { useEffect, useState } from "react";
import { Button } from "@modulocate/ui/components/button";
import { trpcClient } from "./trpc";

function App() {
  const [status, setStatus] = useState("loading...");

  useEffect(() => {
    trpcClient.health.query().then((res) => {
      setStatus(res.status);
    });
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">modulocate — portal</h1>
      <p className="mt-2 text-muted-foreground">
        Backend status: <strong className="text-foreground">{status}</strong>
      </p>
      <Button className="mt-4">Tailwind + shadcn läuft</Button>
    </div>
  );
}

export default App;