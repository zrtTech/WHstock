# Модель данных

Источник истины для образцов — отдельная SQL Server БД. Товарные данные — кэш чтения 1С. Все IDs — UUID (uniqueidentifier). UTC datetime2(3).

## Сущности
Products(id, source_1c_id UNIQUE, article, name, updated_at, is_active); ProductBarcodes(id, product_id, barcode, UNIQUE(product_id,barcode)). Товарный ШК не обязан быть уникальным в реальных данных 1С — неоднозначность нужно показывать.
Locations(id, code UNIQUE, name, is_active).
Samples(id, sample_code UNIQUE, product_id, location_id, state ACTIVE/DELETED, version, created_at, deleted_at). Каждому физическому экземпляру собственный ID.
TagAssignments(id, epc, sample_id, valid_from, valid_to): не более одного активного назначения EPC; интервал закрывается при замене.
SampleEvents(id, sample_id, kind CREATE/MOVE/DELETE, from_location_id, to_location_id, actor_id, device_id, request_id, occurred_at, details_json): append-only.
IdempotencyRequests(device_id, request_id, payload_hash, http_status, response_json, created_at): UNIQUE(device_id,request_id). Один и тот же ключ с другим payload => 409.
Inspections(id, location_id, started_at, finished_at, state, actor_id); InspectionExpected(inspection_id,sample_id,expected_location_id); InspectionObservations(id,inspection_id,epc,resolved_sample_id,observed_location_id,seen_at,device_id).

## Инварианты
- DELETE переводит в DELETED; никакого восстановления из пользовательского интерфейса.
- MOVE требует state=ACTIVE, expectedVersion и toLocationId.
- CREATE/MOVE/DELETE и event — атомарны.
- EPC нельзя назначить двум активным образцам.
- При повторной передаче одной команды состояние и событие не дублируются.
- Старт проверки фиксирует снимок ожидаемых образцов; последующие движения его не меняют.
- Наблюдения не обновляют Samples.location_id.
- Удаление не удаляет исторические события и связи.
- Все FK, индексы и уникальности проверяются миграциями и интеграционными тестами.

См. 001_schema.sql — стартовый DDL. Codex обязан превратить его в Alembic миграцию и проверить на SQL Server 2022.
