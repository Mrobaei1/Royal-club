# Royal Club Admin Command Center — Menu Architecture

Status: implementation plan on an isolated feature branch. This document does not claim that all listed modules or backend capabilities currently exist.

## Product goal
Replace the current long, owner-only admin screen with a navigable, responsive command center. The menu must expose manageable domains as expandable groups and provide a clear landing page, search, status indicators, and breadcrumbs/back navigation. It must work on narrow Android screens and desktop/tablet layouts.

## Non-negotiable authorization
- The menu is navigation, not a security boundary. Every API operation must independently authorize the actor server-side.
- Ordinary users never receive admin navigation.
- Owner sees all owner-authorized sections.
- Deputy sees only explicitly delegated oversight/coordination sections.
- Department managers see only their own department and delegated actions.
- Agents see only their own task console and permitted read/propose actions.
- Hidden menu items must also be denied by backend policy if called directly.
- Unknown role, unavailable permission service, or stale grants => fail closed.
- No menu action may grant permissions, change ownership, permanently offboard agents, or execute financial outflows without the separately approved governance workflow.

## Proposed navigation tree

1. **داشبورد مدیریت**
   - نمای کلی و شاخص‌های کلیدی
   - کارهای نیازمند بررسی
   - هشدارها و رخدادهای مهم
   - وضعیت سرویس‌ها و آخرین گزارش‌ها

2. **مدیریت کاربران و اعضا**
   - جست‌وجو و پرونده کاربر
   - وضعیت حساب و عضویت
   - گزارش‌ها و شکایت‌ها
   - محدودیت‌ها و رسیدگی‌ها
   - دوستان و تعاملات (فقط در حدود مجوز)

3. **مدیریت بازی‌ها**
   - تنظیمات عمومی بازی‌ها
   - تخته‌نرد
   - شطرنج
   - بازی‌های کارتی و حکم
   - UNO
   - Mafia
   - قوانین، زمان‌ها و تنظیمات هر بازی
   - وضعیت بازی‌های آنلاین و رخدادها
   Note: future games are roadmap placeholders until their modules are implemented.

4. **لیگ‌ها و مسابقات**
   - فهرست لیگ‌ها
   - ساخت و تنظیم لیگ
   - زمان‌بندی و دوره‌ها
   - مسابقه‌ها و نتایج
   - اعتراض‌ها و رسیدگی
   - گزارش عملکرد لیگ

5. **مالی و کیف پول**
   - نمای کلی مالی
   - کیف پول کاربران و دفتر کل
   - درخواست‌های واریز و تطبیق
   - پرداخت ریالی
   - رمزارزها و شبکه‌ها
   - تعرفه‌ها و اشتراک‌ها
   - مغایرت‌ها و گزارش حسابداری
   - درخواست‌های بازپرداخت/برداشت
   All refunds and every outbound movement require explicit, action-specific owner approval. Agent validation is advisory; the financial core executes only after policy checks.

6. **مدیریت اشتراک و تعرفه‌ها**
   - طرح‌های اشتراک
   - قیمت‌گذاری خدمات حساب
   - قوانین مصرف اعتبار
   - تنظیمات رایگان/پولی و محدودیت‌ها

7. **شبکه اجتماعی و ارتباطات**
   - دوستان و درخواست‌ها
   - گفت‌وگوی خصوصی
   - اعلان‌ها و پیام‌های همگانی
   - محتوای رسانه‌ای و پیوست‌ها
   - ارتباط با کاربران

8. **بازاریابی و تبلیغات**
   - کمپین‌ها
   - تبلیغات و ویدئوها
   - پیام‌رسانی هدفمند
   - آمار جذب و بازگشت کاربران
   Modules are placeholders until their APIs and controls exist.

9. **مرکز Agentها و اتوماسیون**
   - نمای کلی و وضعیت Agentها
   - ساختار دپارتمان‌ها و مدیران
   - وظایف و صف اجرا
   - پیشنهادها و تأییدها
   - زمان‌بندی و رویدادها
   - گزارش و ممیزی Agentها
   - توقف اضطراری و کنترل اجرا
   Agent creation/activation remains gated until the approved final stage. No self-granting capabilities.

10. **مدیریت سازمانی و اختیارات**
    - ساختار سلسله‌مراتبی
    - مدیران دپارتمان‌ها
    - ماتریس اختیارات
    - مجوزهای تفویض‌شده
    - درخواست تغییر نقش/مجوز
    - سوابق تصمیمات مدیریتی
    Owner-only controls must be clearly distinguished.

11. **امنیت و حفاظت مالکیت**
    - وضعیت امنیتی و هشدارها
    - حفاظت هویت مالک
    - نشست‌ها و دستگاه‌ها
    - احراز هویت چندمرحله‌ای
    - سیاست‌های دسترسی
    - تأیید عملیات حساس
    - رویدادهای امنیتی و audit
    - بازیابی و تداوم سرویس

12. **زیرساخت و تنظیمات سیستم**
    - تنظیمات عمومی
    - اتصال سرویس‌ها و providerها
    - تنظیمات API و شبکه
    - پشتیبان‌گیری و بازیابی
    - وضعیت پایگاه داده و سرویس‌ها
    - مدیریت نسخه و انتشار
    Secrets must never be displayed in plaintext or made available to agents.

13. **گزارش‌ها و تحلیل**
    - گزارش روزانه و دوره‌ای
    - شاخص‌های کاربران و بازی‌ها
    - گزارش مالی
    - عملکرد دپارتمان‌ها
    - عملکرد Agentها
    - خروجی و بایگانی گزارش‌ها

14. **پشتیبانی و ارتباط با ما**
    - درخواست‌های پشتیبانی
    - پیام‌های کاربران
    - پاسخ‌های آماده
    - گزارش مشکلات فنی

15. **تنظیمات پنل مدیریت**
    - زبان و ظاهر
    - ترتیب و جمع/بازشدن گروه‌ها
    - اعلان‌های مدیریتی
    - ترجیحات نمایش

## UX requirements
- Mobile: drawer or full-screen navigation with expandable accordions, clear back navigation, and persistent section title.
- Desktop/tablet: collapsible side navigation plus content area.
- Global menu search filters groups and entries.
- Each entry has a status: available, permission-restricted, or planned/not implemented. Planned entries must not pretend to work; they should show roadmap status and be non-actionable.
- Badges for pending approvals, alerts, and failed jobs only when backed by live data.
- Use Persian and English localization; respect app theme and RTL.
- Dashboard should show only data the current role is authorized to read.
- Avoid one enormous scrolling admin page. Each domain should have its own screen or sub-screen.

## Implementation sequence
1. Inventory all existing admin UI sections, API routes, service methods, and current role/permission behavior.
2. Define a typed menu registry with stable IDs, labels, icons, parent groups, required permissions, and implementation status.
3. Add role-aware navigation and a dashboard shell; do not infer role from username or client flags.
4. Move existing working controls into dedicated subpages without changing their business behavior.
5. Add clearly marked planned placeholders for absent modules; do not invent backend operations.
6. Add responsive mobile/desktop navigation, localization, theme, search, badges.
7. Add widget/navigation tests, permission visibility tests, and direct API denial tests.
8. Verify no ordinary-user route exposes admin navigation and no hidden route bypasses server authorization.

## Acceptance criteria
- Every existing admin feature is reachable from a logical submenu.
- Menu groups are expandable/collapsible and searchable.
- Role-based visibility follows the approved hierarchy and fails closed.
- All existing functions continue to work after relocation.
- Planned modules are visibly marked and non-executable.
- No UI-only security; backend permission checks remain mandatory.
- Flutter analyze and relevant tests pass at exact branch head.
- No merge to main, production deployment, or APK build without separate owner approval.
