import { Sidebar } from "@/components";
import AppAuthGate from "@/components/AppAuthGate";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppAuthGate>
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 pl-64">{children}</main>
      </div>
    </AppAuthGate>
  );
}
