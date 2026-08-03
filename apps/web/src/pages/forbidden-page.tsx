import { ArrowLeft, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ForbiddenPageProps = {
  onBack: () => void;
};

export function ForbiddenPage({ onBack }: ForbiddenPageProps) {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <span
            className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <ShieldX className="size-6" />
          </span>
          <h1 id="forbidden-title" className="text-2xl font-medium tracking-tight">
            无权限访问
          </h1>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">
            当前账号缺少查看此页面所需的权限。你可以返回仪表盘，或联系管理员调整角色。
          </p>
          <Button onClick={onBack}>
            <ArrowLeft />
            返回仪表盘
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
