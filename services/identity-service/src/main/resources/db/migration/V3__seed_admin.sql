-- ============================================================================
--  حساب مشرف لوحة التحكم — بيانات تجريبية.
--  admin@topchoice.local / Admin@123
--
--  محكوم بنفس علامة ${seedDemoData} كسابقه، والافتراضي false.
--
--  هذا هو الفرق بين تعليق وضمان: النسخة السابقة كانت تكتب في التعليق أن
--  الإنتاج لا يُنشئ مشرفًا بترحيل، ثم تُنشئه في كل بيئة على أي حال. الآن
--  يمنعه الترحيل نفسه.
--
--  في الإنتاج يُنشأ المشرف عبر Identity Platform أو سكربت إداري بكلمة مرور
--  تُقرأ من Secret Manager، وتُفعَّل عليه MFA.
-- ============================================================================

INSERT INTO users (id, email, phone, password_hash, full_name, locale, email_verified, status)
SELECT '22222222-2222-2222-2222-222222222222'::uuid,
       'admin@topchoice.local',
       '+201000000002',
       '$2a$10$qSy2UcqsCngA5cmBupomaeKo6ow6vpiSZ731lVaWhBgdWXEC7wgZ2',
       'Store Admin', 'ar', TRUE, 'ACTIVE'
WHERE '${seedDemoData}' = 'true'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
SELECT v.user_id, v.role
FROM (VALUES ('22222222-2222-2222-2222-222222222222'::uuid, 'CUSTOMER'),
             ('22222222-2222-2222-2222-222222222222'::uuid, 'ADMIN')) AS v(user_id, role)
WHERE '${seedDemoData}' = 'true'
ON CONFLICT DO NOTHING;
