# Pending Production migrations

Scanned 70 files. Local migration files seen: 384.
This list is the Production gap recorded on 2026-10-31 (latest applied version 372, hole at 361), plus local migration 441, which is not on Production.
Re-read `supabase_migrations.schema_migrations` before applying. Do not mark versions by hand and do not skip any file.

## Apply order

361, then 373 through 441. Migration 441 is the privilege repair and must stay last.

## Findings

| Version | File | Findings |
|---|---|---|
| 361 | 361_admin_email_view_workspace_gate.sql | none |
| 373 | 373_company_sms_settings.sql | none |
| 374 | 374_fix_enterprise_demo_invoice_statuses.sql | data-write:update, data-write:delete |
| 375 | 375_whatsapp_webhook_callback_url.sql | none |
| 376 | 376_sync_whatsapp_channel_create_if_missing.sql | none |
| 377 | 377_sync_sms_channel_create_if_missing.sql | none |
| 378 | 378_sync_email_channel_create_if_missing.sql | none |
| 379 | 379_fix_support_ticket_number_sequence.sql | none |
| 380 | 380_sms_infobip_provider.sql | none |
| 381 | 381_support_tickets_origin_channel.sql | none |
| 382 | 382_customer_crm_lifecycle.sql | data-write:delete |
| 383 | 383_customer_channel_identities.sql | none |
| 384 | 384_company_acquisition_source.sql | data-write:delete |
| 385 | 385_company_acquisition_hierarchy.sql | none |
| 386 | 386_company_acquisition_retire_youtube_ad_toplevel.sql | none |
| 387 | 387_first_payment_due_superadmin_alerts.sql | none |
| 388 | 388_subscription_unpaid_notification_i18n.sql | none |
| 389 | 389_set_company_billing_cycle_v1.sql | none |
| 390 | 390_saas_checkout_billing_manage_own.sql | none |
| 391 | 391_saas_unpaid_recovery_while_suspended.sql | none |
| 392 | 392_suspended_workspace_hard_lock.sql | none |
| 393 | 393_platform_ai_provider_ensure_connection.sql | none |
| 394 | 394_whatsapp_embedded_signup_metadata.sql | none |
| 395 | 395_quote_send_attempts.sql | privilege:grant-all |
| 396 | 396_lead_conversion_claim.sql | none |
| 397 | 397_portal_public_rpc_hardening.sql | none |
| 398 | 398_web_presence_entitlements.sql | none |
| 399 | 399_web_presence_data_foundation.sql | privilege:grant-all |
| 400 | 400_web_chat_public_backend.sql | privilege:grant-all |
| 401 | 401_web_chat_public_staff_reply_guard.sql | none |
| 402 | 402_web_chat_shared_rate_limit.sql | data-write:delete |
| 403 | 403_website_public_surface.sql | none |
| 404 | 404_website_gallery.sql | none |
| 405 | 405_website_public_branding.sql | none |
| 406 | 406_website_studio_content.sql | none |
| 407 | 407_website_booking_branches.sql | none |
| 408 | 408_website_public_products.sql | none |
| 409 | 409_website_slug_available.sql | none |
| 410 | 410_website_service_pricing.sql | none |
| 411 | 411_portal_upsert_customer_phone_match.sql | none |
| 412 | 412_scheduling_resource_instructor_engineer.sql | none |
| 413 | 413_sequential_booking_confirmation_numbers.sql | none |
| 414 | 414_ai_employee_product_lookup_tools.sql | none |
| 415 | 415_scheduling_booking_slot_capacity.sql | none |
| 416 | 416_catalog_products_permission_rls.sql | none |
| 417 | 417_tool_execution_output_column_privileges.sql | none |
| 418 | 418_catalog_product_type_real_estate.sql | none |
| 419 | 419_website_public_product_images.sql | none |
| 420 | 420_catalog_product_price_tax.sql | none |
| 421 | 421_sales_follow_up.sql | none |
| 422 | 422_catalog_product_aliases.sql | none |
| 423 | 423_crm_concurrency_uniqueness.sql | none |
| 424 | 424_catalog_product_price_tax_unspecified.sql | none |
| 425 | 425_lead_qualification_settings.sql | none |
| 426 | 426_ai_employee_create_draft_quote_tool.sql | none |
| 427 | 427_ai_employee_quote_delivery_tools.sql | none |
| 428 | 428_scheduling_service_kind_demo.sql | none |
| 429 | 429_ai_employee_sales_demo_scheduling_tools.sql | none |
| 430 | 430_opportunity_lifecycle_demo_completed_primary_product.sql | none |
| 431 | 431_opportunity_product_interest_per_lead_product.sql | none |
| 432 | 432_product_demo_scheduling.sql | none |
| 433 | 433_whatsapp_conversation_turn_lease.sql | data-write:delete |
| 434 | 434_web_widget_enable_restores_channel.sql | none |
| 435 | 435_sales_realtime_publication.sql | none |
| 436 | 436_entity_activities_replica_identity.sql | none |
| 437 | 437_customer_import_jobs.sql | privilege:grant-all |
| 438 | 438_customer_company_name.sql | none |
| 439 | 439_actionable_notification_payloads.sql | none |
| 440 | 440_service_role_public_table_grants.sql | none |
| 441 | 441_revoke_anon_authenticated_excess_privileges.sql | none |

## Rehearsal

1. Take a Production backup and record its id. Do not restore it over Production.
2. Restore that backup into a disposable database that is not the Production project.
3. Run `node scripts/rehearse-pending-migrations.mjs`. It refuses Production URLs and `--linked`.
4. On that disposable database only, apply the pending files in the order above with the Supabase CLI.
5. Compare `schema_migrations` to the filenames. Then run the privilege checks in `scripts/verify-least-privilege.mjs` against that disposable database, still not Production.
