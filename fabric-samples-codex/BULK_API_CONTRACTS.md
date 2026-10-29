# Дополнение API: пакетные операции

Дополняет API_CONTRACTS.md. Серверный API должен обеспечивать идемпотентность и прозрачность частичных конфликтов. Все примеры — проект контрактов, не существующие endpoints.

## Пакетное создание

POST /api/v1/sample-batches
{
  "batchRequestId":"uuid",
  "deviceId":"WIN-01",
  "locationId":"uuid",
  "items":[
    {"lineId":"uuid","productId":"uuid","quantity":1},
    {"lineId":"uuid","productId":"uuid","quantity":2}
  ]
}

Успех 201:
{
  "batchId":"uuid",
  "status":"COMMITTED",
  "createdCount":3,
  "samples":[
    {"lineId":"uuid","sampleId":"uuid","sampleCode":"S-000301","locationId":"uuid"},
    {"lineId":"uuid","sampleId":"uuid","sampleCode":"S-000302","locationId":"uuid"},
    {"lineId":"uuid","sampleId":"uuid","sampleCode":"S-000303","locationId":"uuid"}
  ]
}

Требования:
- Проверка всех строк до commit. Невалидная строка => 422, ни один Sample не создан.
- Одна транзакция: batch idempotency record + N Samples + N CREATE events.
- Повтор идентичного batchRequestId с тем же payloadHash возвращает идентичный ответ.
- Тот же ключ с другим payload => 409 REQUEST_ID_CONFLICT.
- Не создавать образцы по одному сетевому запросу на каждый скан: 100 сканов = 1 пакетный запрос.
- Ограничить размер пакета конфигурируемо, например 500 единиц, с явной ошибкой превышения.

## Предпросмотр массовых изменений

POST /api/v1/sample-operations/preview
{
  "operation":"MOVE",
  "targetMode":"EXPLICIT",
  "targetLocationId":"uuid",
  "items":[{"sampleId":"uuid","expectedVersion":3}]
}

Ответ: per-item preview {sampleId,fromLocationId,toLocationId,version,warning,error}; ничего не меняет.

Для targetMode=OBSERVED клиент обязан передать observationId для каждой строки, сервер проверяет, что наблюдение существует и относится к образцу. Устаревшие наблюдения показываются предупреждением. Нельзя использовать произвольный введённый observedLocationId как доказательство обнаружения.

## Применение массовых изменений

POST /api/v1/sample-operations
{
  "batchRequestId":"uuid",
  "deviceId":"WIN-01",
  "operation":"MOVE",
  "items":[
    {"lineId":"uuid","sampleId":"uuid","expectedVersion":3,"toLocationId":"uuid"}
  ]
}

Для DELETE: operation=DELETE; toLocationId отсутствует. Должна быть авторизация на удаление.

Политика по умолчанию: **атомарный пакет**. Если хотя бы один конфликт/невалидная строка, вернуть 409 с itemErrors, ни одну строку не менять. Это исключает неочевидное частичное выполнение. UI показывает конфликтные строки, обновляет версии и предлагает повторный предпросмотр. Если в будущем потребуется частичный commit, его вводить только отдельным согласованным контрактом с per-item status и сохранённым итогом для идемпотентного повтора.

## Получение рабочего списка

GET /api/v1/samples/worklist?workingLocationId=uuid&scope=observed|accounted|related&status=wrong|missing|ok|all&stock=zero|all&query=...&inspectionId=...

Ответ содержит rows [{sampleId,sampleCode,productName,article,accountedLocationId,observedLocationId,observationId,observedAt,inspectionId,inspectionStatus,stockQuantity,stockSyncedAt,stockWarehouse,version}], total, cursor.

Не выдавать статус MISSING, если нет завершённой проверки с замороженным expected snapshot. Если нет наблюдения — NOT_CHECKED. Нулевой остаток из 1С — справочное поле.

## Тесты

100 созданных за одну транзакцию; два одинаковых batchRequestId; неизвестный товар в 100-строчном пакете; два разных количества одного товара; 50 MOVE с версиями; конфликт в одной из 50 строк => 0 изменений; 20 DELETE и 20 events; snapshot проверки неизменяем; наблюдение не изменяет Samples.location_id.
