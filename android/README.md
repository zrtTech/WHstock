# WHstock Android (Step-by-step migration)

Это Native Android-приложение для поэтапной миграции с текущей PWA версии.

## Что сделано

### Step 1 (каркас)
- Gradle-проект `android/` с `minSdk=23`.
- Базовые зависимости: Room, Retrofit/OkHttp, WorkManager, DataStore.
- Базовый `MainActivity` и `Application`.
- Каркас локальной БД и API слоя.

### Step 2
- Экран настроек подключения (`SettingsActivity`).
- Сохранение настроек в DataStore (`SettingsStore`).
- Проверка соединения через `/health`.
- Реализация `SyncOutboxWorker` и `SyncScheduler`.

### Step 3 (реализовано)
- Kiosk-подобный главный экран:
  - ввод кода сканером/вручную,
  - поиск товара.
- Поиск по цепочке типов:
  - `uid` (если GUID),
  - `barcode` → `char_articul` → `articul`.
- Карточка товара на экране (основные поля).
- Базовый режим клиент/менеджер:
  - вход по PIN,
  - в режиме менеджера доступно обновление цены через `/update-product`.

## Следующий шаг (Step 4)

1. Полный экран киоска + автофокус под wedge-сканер.
2. Выбор характеристик (multiple chars) и расширенная карточка.
3. Документы (receive/move/writeoff/stockin/price) и UI-потоки редактирования.

## Как запустить

1. Открыть папку `android/` в Android Studio.
2. Выполнить Gradle Sync.
3. Запустить `app` на Android 6+.

