import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe2, Radio, Activity } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <Globe2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight">HIGH-HANDS</span>
          <Badge variant="outline" className="ml-auto text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
            dev proxy
          </Badge>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-5xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Real-time global intelligence dashboard</CardTitle>
            <CardDescription>
              The HIGH-HANDS app (koala73/worldmonitor) is running on the Vite
              dev server and served through this Next.js gateway at the site root.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="grid gap-3 sm:grid-cols-3">
              <li className="flex items-start gap-2 rounded-lg border p-3">
                <Radio className="h-4 w-4 mt-0.5 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Live news feeds</p>
                  <p className="text-xs text-muted-foreground">Curated global &amp; regional streams</p>
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-lg border p-3">
                <Globe2 className="h-4 w-4 mt-0.5 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Dual map engine</p>
                  <p className="text-xs text-muted-foreground">3D globe + WebGL flat map</p>
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-lg border p-3">
                <Activity className="h-4 w-4 mt-0.5 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Situation awareness</p>
                  <p className="text-xs text-muted-foreground">Cross-stream correlation</p>
                </div>
              </li>
            </ul>
            <div>
              <Button asChild>
                <a href="/index.html">Open the dashboard</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto border-t">
        <div className="container mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground">
          HIGH-HANDS v2.10.0 · AGPL-3.0 · served via Next.js dev proxy → Vite :3001
        </div>
      </footer>
    </div>
  );
}
