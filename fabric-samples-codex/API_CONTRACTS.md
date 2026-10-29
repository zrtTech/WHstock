# API v1

Все изменяющие запросы: HTTPS, Bearer auth, JSON, requestId UUID, deviceId. Серверное время UTC. Любой ответ об ошибке: {"error":{"code":"VERSION_CONFLICT","message":"...","requestId":"..."}}.

## Справочники
GET /api/v1/catalog/search?q=... — поиск товаров по артикулу/названию/ШК; несколько совпадений возвращать массивом.
GET /api/v1/locations — места.
GET /api/v1/resolve?code=... — тип результата SAMPLE, PRODUCT, MULTIPLE, UNKNOWN, DELETED. Не выбирать образец автоматически по общему товарному ШК.

## Операции
POST /api/v1/samples
{"requestId":"uuid","deviceId":"C5-01","productId":"uuid","locationId":"uuid","epc":null}
=> 201 {"sampleId":"uuid","sampleCode":"S00001","version":1,"locationId":"uuid"}

POST /api/v1/samples/{sampleId}/move
{"requestId":"uuid","deviceId":"WIN-01","expectedVersion":1,"toLocationId":"uuid"}
=> 200 {"sampleId":"uuid","version":2,"locationId":"uuid"}

POST /api/v1/samples/{sampleId}/remove
{"requestId":"uuid","deviceId":"WIN-01","expectedVersion":2}
=> 200 {"sampleId":"uuid","state":"DELETED","version":3}

## Проверки
POST /api/v1/inspections
{"requestId":"uuid","deviceId":"C5-01","locationId":"uuid"}
=> 201 {"inspectionId":"uuid","expectedCount":18}

POST /api/v1/inspections/{inspectionId}/observations
{"requestId":"uuid","deviceId":"C5-01","epcs":["EPC1","EPC2"],"observedLocationId":"uuid"}
=> 200 {"accepted":2,"duplicates":0}

GET /api/v1/inspections/{inspectionId}/results
=> {"found":[],"missing":[],"unexpected":[],"unknown":[]}

POST /api/v1/inspections/{inspectionId}/finish
{"requestId":"uuid","deviceId":"C5-01"}
=> 200 {"state":"FINISHED"}

## Контракт ошибок
400 BAD_REQUEST; 401 UNAUTHORIZED; 403 FORBIDDEN; 404 NOT_FOUND; 409 VERSION_CONFLICT, EPC_ALREADY_ASSIGNED, REQUEST_ID_CONFLICT, ALREADY_DELETED; 422 VALIDATION_ERROR; 503 DEPENDENCY_UNAVAILABLE. В теле всегда стабильный code и человекочитаемое message.

## Идемпотентность
Идентичность команды = deviceId + requestId. payloadHash = SHA-256 канонизированного тела команды. Повтор с тем же hash возвращает сохранённые HTTP status/body. С другим hash — 409. Вся запись результата и изменение состояния — одна транзакция. При одновременном одинаковом запросе второй должен дождаться первого и вернуть его результат.

## C5 offline
Локальная долговременная очередь команд с неизменным requestId. Серверный успех показывать только после ответа сервера. При конфликте после reconnect — показывать оператору и не перезаписывать автоматически. Наблюдения и учётные команды разделены.
