import Link from "next/link";

export default function NotFound() {
  return (
    <main className="section stack" style={{ maxWidth: "38rem", margin: "12vh auto" }}>
      <h1>Page not found</h1>
      <p className="muted-text">Check the address or go back to IllamHelp.</p>
      <div><Link className="button" href="/">Go to dashboard</Link></div>
    </main>
  );
}
