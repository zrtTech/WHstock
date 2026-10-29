# Прослеживаемость требований

| ID | Требование | Компонент | Тест |
|---|---|---|---|
| FR-001 | Создать образец | domain.samples.create | test_create |
| FR-002 | Переместить | domain.samples.move | test_move |
| FR-003 | Удалить навсегда | domain.samples.remove | test_remove |
| FR-004 | Наблюдение не меняет место | domain.inspections | test_observation_no_move |
| FR-005 | Snapshot проверки | domain.inspections | test_snapshot_immutable |
| FR-006 | 1/N образцов на товар | domain.resolve | test_multiple_samples |
| FR-007 | EPC активен у одного | domain.tags | test_epc_uniqueness |
| FR-008 | Идемпотентность | domain.idempotency | test_request_retry |
| FR-009 | Конфликт версий | domain.samples | test_version_conflict |
| FR-010 | Read-only 1С | integration_1c | test_readonly_adapter |
| FR-011 | USB HID scanner | desktop.scanner | test_scanner_hardware |
| FR-012 | C5 RFID/2D | android.client | test_c5_hardware |
| FR-013 | C5 offline | android.queue | test_offline_retry |
| FR-014 | Windows Service | deployment | test_service_reboot |
| NFR-001 | Backup/restore | operations | test_restore |
| NFR-002 | Нативный GUI | desktop | test_ui |
| NFR-003 | Аудит событий | persistence.events | test_event_atomicity |

Codex заполняет реальный путь к исходнику, имя автоматического теста, дату, результат и evidence. Нельзя помечать требование PASS до выполнения теста.
