-- ============================================================================
--  مستخدم لوحة التحكم للتطوير المحلي.
--  admin@topchoice.local / Admin@123
--
--  في الإنتاج لا يُنشأ مشرف بترحيل قاعدة بيانات: يُنشأ عبر Cognito أو
--  سكربت إداري بكلمة مرور تُقرأ من Secrets Manager، وتُفعَّل عليه MFA.
-- ============================================================================

INSERT INTO users (id, email, phone, password_hash, full_name, locale, email_verified, status)
VALUES ('22222222-2222-2222-2222-222222222222',
        'admin@topchoice.local',
        '+971500000002',
        '$2a$10$qSy2UcqsCngA5cmBupomaeKo6ow6vpiSZ731lVaWhBgdWXEC7wgZ2',
        'Store Admin', 'ar', TRUE, 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES ('22222222-2222-2222-2222-222222222222', 'CUSTOMER'),
       ('22222222-2222-2222-2222-222222222222', 'ADMIN')
ON CONFLICT DO NOTHING;
