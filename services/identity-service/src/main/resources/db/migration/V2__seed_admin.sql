-- ============================================================================
--  بيانات تجريبية — عميل واحد.
--  demo@topchoice.local / Passw0rd!   (BCrypt cost 10)
--
--  محكومة بعلامة ${seedDemoData} التي تُحقن من spring.flyway.placeholders.
--  الافتراضي false: الترحيل يُطبَّق في كل بيئة (فيبقى سجل Flyway متسقًا
--  وتبقى البصمة ثابتة) لكنه لا يُدخل صفًا واحدًا ما لم تُرفع العلامة صراحةً.
--
--  البديل — حذف الملف في الإنتاج — كان سيجعل تاريخ الترحيلات مختلفًا بين
--  البيئتين، وهي أسرع طريقة لجعل ترحيلًا يعمل محليًا ويفشل عند النشر.
-- ============================================================================

INSERT INTO users (id, email, phone, password_hash, full_name, locale, email_verified, status)
SELECT '11111111-1111-1111-1111-111111111111'::uuid,
       'demo@topchoice.local',
       '+201000000001',
       '$2a$10$4IYf.EQ3NNkB4hdgUrlbfu/SJKs3KJXJZdDWrUzcyoShWU6itSH9y',
       'Demo Customer', 'ar', TRUE, 'ACTIVE'
WHERE '${seedDemoData}' = 'true'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
SELECT v.user_id, v.role
FROM (VALUES ('11111111-1111-1111-1111-111111111111'::uuid, 'CUSTOMER')) AS v(user_id, role)
WHERE '${seedDemoData}' = 'true'
ON CONFLICT DO NOTHING;

INSERT INTO addresses (user_id, label, full_name, phone, line1, area, city, country, is_default)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, 'home', 'Demo Customer', '+201000000001',
       'شارع التسعين الشمالي، برج ١، شقة ١٢٠٤', 'التجمع الخامس', 'القاهرة', 'EG', TRUE
WHERE '${seedDemoData}' = 'true'
ON CONFLICT DO NOTHING;
