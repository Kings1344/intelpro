-- Database integration checks for the IntelPro migration (run by scripts/test-db.sh).
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES ('u1','a@x.io','A','h',now()),('u2','b@x.io','B','h',now());
INSERT INTO "Market"(id,question,category,"creatorId","updatedAt",status,"isDemo") VALUES ('m1','Q?','Crypto','u1',now(),'ACTIVE',true);
INSERT INTO "MarketCriteria"(id,"marketId",version,"originalQuestion","improvedQuestion","yesCondition","noCondition","resolutionDeadline","dataSource",methodology,"clarityScore",issues,engine,approved)
  VALUES ('c1','m1',1,'q','Q','Y','N',now()+interval '30 days','S','M',62,'[]','HEURISTIC',true);
INSERT INTO "Evidence"(id,"marketId","submittedById",title,"sourceName","sourceUrl",description,"updatedAt",status,"claimedStance")
  VALUES ('e1','m1','u2','T','S','https://example.com','D',now(),'ANALYSED','SUPPORTS_NO');
INSERT INTO "EvidenceAnalysis"(id,"evidenceId",engine,"sourceAccessible",summary,stance,relevance,claims,reasoning) VALUES ('a1','e1','AI',true,'s','SUPPORTS_NO',0.9,'[]','r');
INSERT INTO "ResolutionRecommendation"(id,"marketId","criteriaId",recommendation,confidence,reasoning,uncertainty,"missingInformation","citedEvidenceIds","rejectedCitations",engine)
  VALUES ('r1','m1','c1','NO_SUPPORTED',0.7,'x','y','[]',ARRAY['e1'],ARRAY[]::text[],'HEURISTIC');
INSERT INTO "Dispute"(id,"marketId","recommendationId","challengerId",reason,"updatedAt") VALUES ('d1','m1','r1','u2','because',now());
INSERT INTO "DisputeComment"(id,"disputeId","authorId",body) VALUES ('dc1','d1','u1','hi');
INSERT INTO "Transaction"(id,"userId","marketId","walletAddress",signature,network,kind,"updatedAt") VALUES ('t1','u1','m1','W','sig1','devnet','PREDICT_RESOLVE',now());
INSERT INTO "AuditLog"(id,"actorId",action,"entityType","entityId") VALUES ('al1','u1','x','Market','m1');

-- Unique constraints
DO $$ BEGIN
  BEGIN INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES ('u3','a@x.io','dup','h',now()); RAISE EXCEPTION 'FAIL: duplicate email accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: unique email'; END;
  BEGIN INSERT INTO "MarketCriteria"(id,"marketId",version,"originalQuestion","improvedQuestion","yesCondition","noCondition","resolutionDeadline","dataSource",methodology,"clarityScore",issues,engine) VALUES ('c2','m1',1,'q','Q','Y','N',now(),'S','M',1,'[]','AI'); RAISE EXCEPTION 'FAIL: duplicate criteria version accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: unique (marketId, version)'; END;
  BEGIN INSERT INTO "Transaction"(id,"userId","walletAddress",signature,network,kind,"updatedAt") VALUES ('t2','u1','W','sig1','devnet','WALLET_TEST',now()); RAISE EXCEPTION 'FAIL: duplicate signature accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: unique transaction signature'; END;
  BEGIN INSERT INTO "Evidence"(id,"marketId",title,"sourceName","sourceUrl",description,"updatedAt",status) VALUES ('e9','m1','T','S','u','D',now(),'VERIFIED'); RAISE EXCEPTION 'FAIL: invalid evidence status accepted';
  EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'PASS: evidence status enum enforced'; END;
  BEGIN INSERT INTO "Evidence"(id,"marketId",title,"sourceName","sourceUrl",description,"updatedAt") VALUES ('e8','nope','T','S','u','D',now()); RAISE EXCEPTION 'FAIL: orphan evidence accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: evidence requires a market'; END;
  -- A user who raised a dispute cannot be deleted silently (audit integrity).
  BEGIN DELETE FROM "User" WHERE id='u2'; RAISE EXCEPTION 'FAIL: challenger deleted while dispute exists';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: dispute challenger is protected (RESTRICT)'; END;
END $$;

-- Migration 2: auth tokens and PDF evidence
INSERT INTO "AuthToken"(id,"userId",type,"tokenHash","expiresAt") VALUES ('at1','u1','PASSWORD_RESET','h1',now()+interval '30 minutes');
INSERT INTO "Evidence"(id,"marketId",title,"sourceName","sourceKind",description,"updatedAt") VALUES ('ep','m1','PDF','Pub','PDF_UPLOAD','D',now());
INSERT INTO "EvidenceFile"(id,"evidenceId","fileName","mimeType","sizeBytes",sha256,data,"extractionStatus") VALUES ('f1','ep','a.pdf','application/pdf',4,'s',decode('25504446','hex'),'NO_TEXT');
DO $$ BEGIN
  BEGIN INSERT INTO "AuthToken"(id,"userId",type,"tokenHash","expiresAt") VALUES ('at2','u1','EMAIL_VERIFICATION','h1',now()); RAISE EXCEPTION 'FAIL: duplicate token hash accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: token hashes are unique'; END;
  BEGIN INSERT INTO "Evidence"(id,"marketId",title,"sourceName",description,"updatedAt") VALUES ('eu','m1','T','S','D',now()); RAISE EXCEPTION 'FAIL: URL evidence without URL accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: URL evidence requires a URL; PDF uploads may omit it'; END;
  BEGIN INSERT INTO "EvidenceFile"(id,"evidenceId","fileName","mimeType","sizeBytes",sha256,data,"extractionStatus") VALUES ('f2','ep','b.pdf','application/pdf',4,'s',decode('25504446','hex'),'EXTRACTED'); RAISE EXCEPTION 'FAIL: two files for one evidence row';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: one file per evidence record'; END;
  IF (SELECT "emailVerifiedAt" FROM "User" WHERE id='u1') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: new users must start unverified'; END IF;
  RAISE NOTICE 'PASS: new users start unverified';
END $$;

-- Cascades: deleting a market removes its criteria, evidence, analyses, recommendations, disputes, comments; keeps audit log; nulls tx link.
DELETE FROM "Market" WHERE id='m1';
DO $$ BEGIN
  IF (SELECT count(*) FROM "EvidenceFile") <> 0 THEN RAISE EXCEPTION 'FAIL: PDF files not removed with their market'; END IF;
  IF (SELECT count(*) FROM "MarketCriteria") + (SELECT count(*) FROM "Evidence") + (SELECT count(*) FROM "EvidenceAnalysis") + (SELECT count(*) FROM "ResolutionRecommendation") + (SELECT count(*) FROM "Dispute") + (SELECT count(*) FROM "DisputeComment") <> 0
    THEN RAISE EXCEPTION 'FAIL: market cascade incomplete'; END IF;
  IF (SELECT "marketId" FROM "Transaction" WHERE id='t1') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: transaction market link not nulled'; END IF;
  IF (SELECT count(*) FROM "AuditLog") <> 1 THEN RAISE EXCEPTION 'FAIL: audit log affected by market delete'; END IF;
  RAISE NOTICE 'PASS: market delete cascades; transactions and audit log preserved';
END $$;

-- Deleting a user cascades sessions/wallets/notifications and nulls the audit actor.
INSERT INTO "Session"(id,"tokenHash","userId","expiresAt") VALUES ('s1','th','u1',now()+interval '1 day');
INSERT INTO "Wallet"(id,"userId",address,"verifiedAt") VALUES ('w1','u1','addr',now());
INSERT INTO "Notification"(id,"userId",type,title,body) VALUES ('n1','u1','t','t','b');
DELETE FROM "User" WHERE id='u1';
DO $$ BEGIN
  IF (SELECT count(*) FROM "AuthToken") <> 0 THEN RAISE EXCEPTION 'FAIL: auth tokens not removed with their user'; END IF;
  IF (SELECT count(*) FROM "Session")+(SELECT count(*) FROM "Wallet")+(SELECT count(*) FROM "Notification")+(SELECT count(*) FROM "Transaction") <> 0 THEN RAISE EXCEPTION 'FAIL: user cascade incomplete'; END IF;
  IF (SELECT "actorId" FROM "AuditLog" WHERE id='al1') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: audit actor not nulled'; END IF;
  RAISE NOTICE 'PASS: user delete cascades personal data and keeps anonymised audit entries';
END $$;

ROLLBACK;
