import { Wallet } from "lucide-react";

/** 产品能力的概念插画，不呈现虚构的业务金额或统计数据。 */
function LedgerIllustration() {
  return (
    <svg
      role="img"
      aria-label="Xpense 将日常收支、账户分类与房源合同收纳到同一工作区"
      viewBox="0 0 560 350"
      className="block w-full max-w-[35rem] text-primary"
      fill="none"
    >
      <title>收支与租务，一处掌握</title>
      {/* 后方的房源与合同卷宗。 */}
      <g transform="translate(390 38) rotate(8 72 104)">
        <path
          d="M0 18Q0 8 10 8H48L60 0H134Q144 0 144 10V204Q144 214 134 214H10Q0 214 0 204Z"
          fill="var(--muted)"
          stroke="var(--muted-foreground)"
          strokeOpacity=".4"
        />
        <rect x="12" y="23" width="120" height="179" rx="6" fill="var(--card)" />
        <path d="M40 109V63L71 47L102 63V109Z" fill="var(--muted)" />
        <path d="M71 47V109M40 63L71 79L102 63" stroke="var(--muted-foreground)" />
        <path
          d="M50 76V84M60 81V89M50 92V100M60 97V105M82 81V89M93 76V84M82 97V105M93 92V100"
          stroke="var(--muted-foreground)"
          strokeWidth="3"
        />
        <text x="72" y="139" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="600">
          房源与合同
        </text>
        <path
          d="M38 157H107M48 169H96"
          stroke="var(--border)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* 打开的账本是主体，左右书页对应收支记录与分类管理。 */}
      <g transform="translate(67 80) rotate(-8 170 110)">
        <path
          d="M0 17Q86 -9 170 20Q250 -7 340 17V226Q250 206 170 232Q86 207 0 226Z"
          fill="var(--primary)"
          fillOpacity=".12"
          stroke="var(--primary)"
          strokeOpacity=".45"
        />
        <path
          d="M8 6Q86 -15 170 11Q253 -15 332 6V214Q251 195 170 221Q87 196 8 214Z"
          fill="var(--card)"
          stroke="var(--muted-foreground)"
          strokeOpacity=".6"
        />
        <path d="M170 12V219" stroke="var(--border)" />
        <path d="M178 12V216" stroke="var(--muted)" strokeWidth="6" />
        <text x="32" y="43" fill="currentColor" fontSize="15" fontWeight="600">
          日常收支
        </text>
        <text x="202" y="43" fill="currentColor" fontSize="15" fontWeight="600">
          账户分类
        </text>
        <g stroke="var(--border)">
          <path d="M32 59H146M32 96H146M32 133H146M32 170H146M202 158H307M202 179H286" />
        </g>
        <g fill="var(--muted-foreground)" fontSize="12">
          <text x="32" y="83">
            收入
          </text>
          <text x="32" y="120">
            支出
          </text>
          <text x="32" y="157">
            转账
          </text>
        </g>
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M119 77H139M129 72V82M119 115H139M119 152H139" />
        </g>
        <circle cx="254" cy="103" r="29" stroke="var(--muted)" strokeWidth="12" />
        <path d="M254 74A29 29 0 0 1 283 103" stroke="currentColor" strokeWidth="12" />
        <path d="M283 103A29 29 0 0 1 230 119" stroke="var(--muted-foreground)" strokeWidth="12" />
        <path d="M43 188H100" stroke="var(--muted)" strokeWidth="5" strokeLinecap="round" />
        <path d="M145 3V42L135 35L125 40V0" fill="var(--primary)" />
      </g>
    </svg>
  );
}

export function LoginShowcase() {
  return (
    <aside
      aria-label="产品预览"
      className="hidden min-w-0 flex-col border-r bg-muted/40 p-10 lg:flex xl:p-12"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Wallet className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Xpense</span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="mx-auto w-full max-w-[35rem]">
          <h2 className="max-w-[12em] text-4xl font-semibold leading-[1.35] tracking-tight xl:text-5xl">
            收支与租务，
            <span className="block">一处掌握。</span>
          </h2>
          <p className="mt-5 max-w-[27em] text-sm leading-7 text-muted-foreground">
            记好每笔收支，管好每份租约。
            <br />
            从日常账目到房源合同，让管理更有条理。
          </p>
        </div>
        <div className="mx-auto mt-8 w-full max-w-[35rem]">
          <LedgerIllustration />
        </div>
      </div>
    </aside>
  );
}
