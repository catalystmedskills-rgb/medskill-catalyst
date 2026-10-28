import { Card, CardContent } from "@/src/components/ui/card";
import { SiteHeader } from "@/src/components/site-header";

const WHATSAPP_URL = "https://wa.me/918800665154";

export function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-canvas font-body">
      <SiteHeader />
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-pale text-2xl">
            🔗
          </div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
          <a
            href={WHATSAPP_URL}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-pill bg-wa px-6 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Message us on WhatsApp
          </a>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
