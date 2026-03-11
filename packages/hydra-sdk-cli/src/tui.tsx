import { Head } from "@no-witness-labs/hydra-sdk";
import { Box, render, Text, useApp } from "ink";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Status Display
// ---------------------------------------------------------------------------

const StatusLine = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Text bold>{label}: </Text>
    <Text>{value}</Text>
  </Box>
);

const HeadStatus = ({ head }: { head: Head.HydraHead }) => {
  const [state, setState] = useState(head.getState());
  const [headId, setHeadId] = useState(head.headId ?? "none");

  useEffect(() => {
    const interval = setInterval(() => {
      setState(head.getState());
      setHeadId(head.headId ?? "none");
    }, 500);
    return () => clearInterval(interval);
  }, [head]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Hydra Head TUI
      </Text>
      <Box marginTop={1} flexDirection="column">
        <StatusLine label="Status" value={state} />
        <StatusLine label="Head ID" value={headId} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press q to quit</Text>
      </Box>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// App Root
// ---------------------------------------------------------------------------

const App = ({ head }: { head: Head.HydraHead }) => {
  const { exit } = useApp();

  useEffect(() => {
    const onKey = (data: Buffer) => {
      if (data.toString() === "q") {
        exit();
      }
    };
    process.stdin.on("data", onKey);
    return () => {
      process.stdin.off("data", onKey);
    };
  }, [exit]);

  return <HeadStatus head={head} />;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const runTui = async (url: string): Promise<void> => {
  const head = await Head.create({ url });
  const { waitUntilExit } = render(<App head={head} />);
  await waitUntilExit();
  await head.dispose();
};
