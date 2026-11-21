-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BundleDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" REAL NOT NULL,
    "minProducts" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "oneTimeUse" BOOLEAN NOT NULL DEFAULT true,
    "discountCode" TEXT,
    "shopifyDiscountId" TEXT,
    "endsAt" DATETIME,
    "expire24Hours" BOOLEAN NOT NULL DEFAULT false,
    "expireAfterHours" INTEGER DEFAULT 24,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BundleDiscount_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BundleDiscount" ("bundleId", "createdAt", "discountCode", "discountType", "discountValue", "endsAt", "id", "isActive", "minProducts", "oneTimeUse", "shopifyDiscountId", "updatedAt") SELECT "bundleId", "createdAt", "discountCode", "discountType", "discountValue", "endsAt", "id", "isActive", "minProducts", "oneTimeUse", "shopifyDiscountId", "updatedAt" FROM "BundleDiscount";
DROP TABLE "BundleDiscount";
ALTER TABLE "new_BundleDiscount" RENAME TO "BundleDiscount";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
