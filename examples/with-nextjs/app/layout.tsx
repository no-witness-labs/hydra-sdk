import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hydra SDK — Next.js Example",
  description:
    "Full-stack Hydra Head management with server-side head and client-side UI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#e5e5e5",
        }}
      >
        {children}
      </body>
    </html>
  );
}
