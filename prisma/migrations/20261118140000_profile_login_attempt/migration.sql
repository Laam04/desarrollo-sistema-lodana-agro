CREATE TABLE "ProfileLoginAttempt" (
    "profile" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileLoginAttempt_pkey" PRIMARY KEY ("profile")
);
