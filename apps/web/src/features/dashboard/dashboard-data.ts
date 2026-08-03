export const dashboardMetrics = [
  { label: "总收入", value: "¥45,231.89", change: "较上月 +20.1%" },
  { label: "订阅数", value: "+2,350", change: "较上月 +180.1%" },
  { label: "销售额", value: "¥12,234", change: "较上月 +19.0%" },
  { label: "当前活跃", value: "+573", change: "过去一小时 +201" },
] as const;

export const overviewData = Object.freeze(
  [2400, 1398, 9800, 3908, 4800, 3800, 4300, 5200, 4100, 6100, 5400, 7200].map((total, index) =>
    Object.freeze({ month: `${index + 1}月`, total }),
  ),
);

export const recentSales = Object.freeze([
  Object.freeze({
    name: "张雨晴",
    email: "yuqing.zhang@example.com",
    amount: "+¥1,999.68",
    initials: "张",
  }),
  Object.freeze({ name: "陈墨", email: "mo.chen@example.com", amount: "+¥39.26", initials: "陈" }),
  Object.freeze({
    name: "王小川",
    email: "xiaochuan.wang@example.com",
    amount: "+¥299.84",
    initials: "王",
  }),
  Object.freeze({ name: "林嘉", email: "jia.lin@example.com", amount: "+¥99.73", initials: "林" }),
  Object.freeze({
    name: "赵思远",
    email: "siyuan.zhao@example.com",
    amount: "+¥154.61",
    initials: "赵",
  }),
]);

export const analyticsData = Object.freeze({
  traffic: Object.freeze([
    Object.freeze({ day: "周一", visits: 420, uniqueVisitors: 260 }),
    Object.freeze({ day: "周二", visits: 568, uniqueVisitors: 342 }),
    Object.freeze({ day: "周三", visits: 486, uniqueVisitors: 301 }),
    Object.freeze({ day: "周四", visits: 721, uniqueVisitors: 448 }),
    Object.freeze({ day: "周五", visits: 664, uniqueVisitors: 409 }),
    Object.freeze({ day: "周六", visits: 382, uniqueVisitors: 231 }),
    Object.freeze({ day: "周日", visits: 438, uniqueVisitors: 276 }),
  ]),
  metrics: Object.freeze([
    Object.freeze({ label: "总访问量", value: "1,248", change: "较上周 +12.4%" }),
    Object.freeze({ label: "独立访客", value: "832", change: "较上周 +5.8%" }),
    Object.freeze({ label: "跳出率", value: "42%", change: "较上周 -3.2%" }),
    Object.freeze({ label: "平均会话", value: "3分24秒", change: "较上周 +18秒" }),
  ]),
  referrers: Object.freeze([
    Object.freeze({ label: "直接访问", value: 512 }),
    Object.freeze({ label: "产品社区", value: 238 }),
    Object.freeze({ label: "社交媒体", value: 174 }),
    Object.freeze({ label: "内容博客", value: 104 }),
  ]),
  devices: Object.freeze([
    Object.freeze({ label: "桌面端", value: 74 }),
    Object.freeze({ label: "移动端", value: 22 }),
    Object.freeze({ label: "平板端", value: 4 }),
  ]),
});
