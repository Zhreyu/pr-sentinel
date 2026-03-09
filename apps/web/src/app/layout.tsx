import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Sentinel",
  description: "AI-powered PR triage platform for open source maintainers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased bg-[var(--bg-main)] text-[var(--text-main)]">
        {children}
      </body>
    </html>
  );
}
