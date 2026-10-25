CREATE TABLE "driver_records" (
    "id" SERIAL NOT NULL,
    "documentType" VARCHAR(30) NOT NULL,
    "documentNumber" VARCHAR(15) NOT NULL,
    "lastNames" VARCHAR(120) NOT NULL,
    "firstNames" VARCHAR(120) NOT NULL,
    "licenseClass" VARCHAR(30) NOT NULL,
    "licenseNumber" VARCHAR(30) NOT NULL,
    "licenseType" VARCHAR(30) NOT NULL DEFAULT 'FISICA',
    "status" VARCHAR(30) NOT NULL DEFAULT 'Vigente',
    "issuedAt" VARCHAR(20) NOT NULL,
    "expiresAt" VARCHAR(20) NOT NULL,
    "restrictions" VARCHAR(120) NOT NULL DEFAULT 'SIN RESTRICCIONES',
    "issuer" VARCHAR(180) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_records_documentNumber_key" ON "driver_records"("documentNumber");
CREATE INDEX "driver_records_documentType_documentNumber_idx" ON "driver_records"("documentType", "documentNumber");

