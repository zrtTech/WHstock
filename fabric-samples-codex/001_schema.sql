-- Начальная схема отдельной БД FabricSamples (SQL Server 2022).
-- НЕ выполнять в БД 1С. Codex должен оформить Alembic migration.
CREATE TABLE dbo.Products (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 source_1c_id nvarchar(100) NOT NULL UNIQUE,
 article nvarchar(120) NULL,
 name nvarchar(500) NOT NULL,
 is_active bit NOT NULL DEFAULT 1,
 updated_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Products_Article ON dbo.Products(article);
CREATE TABLE dbo.ProductBarcodes (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 product_id uniqueidentifier NOT NULL REFERENCES dbo.Products(id),
 barcode nvarchar(150) NOT NULL,
 CONSTRAINT UQ_ProductBarcodes_Product_Code UNIQUE(product_id,barcode)
);
CREATE INDEX IX_ProductBarcodes_Code ON dbo.ProductBarcodes(barcode);
CREATE TABLE dbo.Locations (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 code nvarchar(80) NOT NULL UNIQUE,
 name nvarchar(250) NOT NULL,
 is_active bit NOT NULL DEFAULT 1
);
CREATE TABLE dbo.Samples (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 sample_code nvarchar(100) NOT NULL UNIQUE,
 product_id uniqueidentifier NOT NULL REFERENCES dbo.Products(id),
 location_id uniqueidentifier NOT NULL REFERENCES dbo.Locations(id),
 state varchar(12) NOT NULL CHECK (state IN ('ACTIVE','DELETED')),
 version int NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 deleted_at datetime2(3) NULL,
 CONSTRAINT CK_Samples_DeleteState CHECK ((state='ACTIVE' AND deleted_at IS NULL) OR (state='DELETED' AND deleted_at IS NOT NULL))
);
CREATE INDEX IX_Samples_Location_State ON dbo.Samples(location_id,state);
CREATE INDEX IX_Samples_Product_State ON dbo.Samples(product_id,state);
CREATE TABLE dbo.TagAssignments (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 epc nvarchar(128) NOT NULL,
 sample_id uniqueidentifier NOT NULL REFERENCES dbo.Samples(id),
 valid_from datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 valid_to datetime2(3) NULL,
 CONSTRAINT CK_TagAssignments_Time CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX UX_TagAssignments_ActiveEpc ON dbo.TagAssignments(epc) WHERE valid_to IS NULL;
CREATE UNIQUE INDEX UX_TagAssignments_ActiveSample ON dbo.TagAssignments(sample_id) WHERE valid_to IS NULL;
CREATE TABLE dbo.SampleEvents (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 sample_id uniqueidentifier NOT NULL REFERENCES dbo.Samples(id),
 kind varchar(12) NOT NULL CHECK (kind IN ('CREATE','MOVE','DELETE')),
 from_location_id uniqueidentifier NULL REFERENCES dbo.Locations(id),
 to_location_id uniqueidentifier NULL REFERENCES dbo.Locations(id),
 actor_id nvarchar(100) NOT NULL,
 device_id nvarchar(100) NOT NULL,
 request_id uniqueidentifier NOT NULL,
 occurred_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 details_json nvarchar(max) NULL
);
CREATE INDEX IX_SampleEvents_Sample_Time ON dbo.SampleEvents(sample_id,occurred_at);
CREATE TABLE dbo.IdempotencyRequests (
 device_id nvarchar(100) NOT NULL,
 request_id uniqueidentifier NOT NULL,
 payload_hash char(64) NOT NULL,
 http_status int NOT NULL,
 response_json nvarchar(max) NOT NULL,
 created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_IdempotencyRequests PRIMARY KEY(device_id,request_id)
);
CREATE TABLE dbo.Inspections (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 location_id uniqueidentifier NOT NULL REFERENCES dbo.Locations(id),
 started_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 finished_at datetime2(3) NULL,
 state varchar(12) NOT NULL CHECK(state IN ('OPEN','FINISHED')),
 actor_id nvarchar(100) NOT NULL
);
CREATE TABLE dbo.InspectionExpected (
 inspection_id uniqueidentifier NOT NULL REFERENCES dbo.Inspections(id),
 sample_id uniqueidentifier NOT NULL REFERENCES dbo.Samples(id),
 expected_location_id uniqueidentifier NOT NULL REFERENCES dbo.Locations(id),
 CONSTRAINT PK_InspectionExpected PRIMARY KEY(inspection_id,sample_id)
);
CREATE TABLE dbo.InspectionObservations (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 inspection_id uniqueidentifier NOT NULL REFERENCES dbo.Inspections(id),
 epc nvarchar(128) NOT NULL,
 resolved_sample_id uniqueidentifier NULL REFERENCES dbo.Samples(id),
 observed_location_id uniqueidentifier NOT NULL REFERENCES dbo.Locations(id),
 seen_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 device_id nvarchar(100) NOT NULL
);
CREATE INDEX IX_InspectionObservations_Inspection_Epc ON dbo.InspectionObservations(inspection_id,epc);
-- Приложение не должно иметь права DELETE/UPDATE на SampleEvents.
-- Проверка перекрытия исторических интервалов EPC — в транзакционной доменной логике.
