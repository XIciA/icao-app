import { createHash } from 'node:crypto';

import { VerificationException, VerificationStatus } from '@apple/app-store-server-library';
import type {
  VerifiedAppleNotification,
  VerifiedAppleTransaction,
} from '../src/commerce/commerce-domain';
import { describe, expect, it } from 'vitest';

import { OfficialAppleStoreVerifier } from '../src/commerce/apple-store-verifier';

// The payload fields come from Apple's App Store Server Library v3.1.0
// signedTransaction model (MIT). A repository-owned certificate chain signs
// the complete payload so x5c, ES256, VerificationStatus and domain mapping are
// deterministic and fully offline.
const APPLE_TRANSACTION_FIXTURE_ROOT_CA = Buffer.from(
  'MIIBrDCCAVKgAwIBAgIUT8LRCoebzpzx6MO9PHInX9TwAKQwCgYIKoZIzj0EAwIwIjEgMB4GA1UEAwwXSUNBTyBBcHBsZSBGaXh0dXJlIFJvb3QwHhcNMjYwODI0MDkyMTU0WhcNMzYwODIxMDkyMTU0WjAiMSAwHgYDVQQDDBdJQ0FPIEFwcGxlIEZpeHR1cmUgUm9vdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABKVd+p2eFU6qW8MuPqKNs5Dzy2uKUe3goBgEYrA7QjDXCVTCn5gbterIuz1ErsgGD9q0lV72HSv8Ou71m5uXTsmjZjBkMB0GA1UdDgQWBBQptpjFCxgdD/EUqTFFxBQLtDQHkzAfBgNVHSMEGDAWgBQptpjFCxgdD/EUqTFFxBQLtDQHkzASBgNVHRMBAf8ECDAGAQH/AgEBMA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNIADBFAiApIQGT/5AmH4MFNM/JUm+/2gJytoQU6QyA/2dl28WVxgIhAPM1fFx9cQzukBR6BDLPPiikFiFB6f8JnpgP1q5MdcxS',
  'base64',
);
const NON_RENEWING_FIXTURE_ROOT_CA = Buffer.from(
  'MIIBxTCCAWygAwIBAgIUcPmtRMcbm+0sQnNvL7FCHHr7SOIwCgYIKoZIzj0EAwIwLzEtMCsGA1UEAwwkSUNBTyBBcHBsZSBOb24tUmVuZXdpbmcgRml4dHVyZSBSb290MB4XDTI2MDgyNDE1MTAyMloXDTM2MDgyMTE1MTAyMlowLzEtMCsGA1UEAwwkSUNBTyBBcHBsZSBOb24tUmVuZXdpbmcgRml4dHVyZSBSb290MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEnuYWA0cK5HZvEUWTaQWTGj4OXtUZrLg2N8i2ua6MiWOw/LATnfaJcEvCdox3bMF+kbt4KwQIdvNlQhX3r3MTuqNmMGQwHQYDVR0OBBYEFPYKVeooXjSOW/Tn/oE0Ucfown4JMB8GA1UdIwQYMBaAFPYKVeooXjSOW/Tn/oE0Ucfown4JMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0cAMEQCIEc/3rFWMbogc43R7Nj+2CAn1ZzmPgsZZ8P78oPJKNQBAiA91RZE1QtvyMlSacPc0M/UGnHrv7nb6dX2Up+hrwBopA==',
  'base64',
);
const NON_RENEWING_SIGNED_TRANSACTION = 'eyJ4NWMiOlsiTUlJQjJ6Q0NBWUNnQXdJQkFnSVVWdkxNbUJaczMrS2ZrSzM0NTFOMEtkRStLRDR3Q2dZSUtvWkl6ajBFQXdJd056RTFNRE1HQTFVRUF3d3NTVU5CVHlCQmNIQnNaU0JPYjI0dFVtVnVaWGRwYm1jZ1JtbDRkSFZ5WlNCSmJuUmxjbTFsWkdsaGRHVXdIaGNOTWpZd09ESTBNVFV4TURJeVdoY05Nekl3TWpFME1UVXhNREl5V2pBdk1TMHdLd1lEVlFRRERDUkpRMEZQSUVGd2NHeGxJRTV2YmkxU1pXNWxkMmx1WnlCR2FYaDBkWEpsSUV4bFlXWXdXVEFUQmdjcWhrak9QUUlCQmdncWhrak9QUU1CQndOQ0FBUTJkR3pNQWFTeXFsSG5uSW5iY1R6aG1xNnJRaEZFTnR5azNaSVhIZGZ6RE16R0dXdVl5dkVEc0dvRlhvcHFLbU9Pakk4NDZRWDRhZWlFR1Zhdk5teE1vM0l3Y0RBTUJnTlZIUk1CQWY4RUFqQUFNQTRHQTFVZER3RUIvd1FFQXdJSGdEQVFCZ29xaGtpRzkyTmtCZ3NCQkFJRkFEQWRCZ05WSFE0RUZnUVVOQUd3TnJ3NXlMZm8vS2I5b0t2U0NWdERlOTh3SHdZRFZSMGpCQmd3Rm9BVVpiN3hZMkxWNGtTV0V2UDhZeW5Qa0l5aWlwWXdDZ1lJS29aSXpqMEVBd0lEU1FBd1JnSWhBSVBOK2ZVdElHcmhhQUpzM0psUTVod2p6MTZ1ZVJkREIvOFl2KzNXdDY4SkFpRUF5NHF5bUxrTmtOK201cG9vL1grWmlOZFRMZ1RoZStBcUg4Z0ViTmVEM2hRPSIsIk1JSUIzekNDQVlhZ0F3SUJBZ0lVSXRoSFRqYW1kaGRBUkp2NzBzNjJIaFVwSGxnd0NnWUlLb1pJemowRUF3SXdMekV0TUNzR0ExVUVBd3drU1VOQlR5QkJjSEJzWlNCT2IyNHRVbVZ1WlhkcGJtY2dSbWw0ZEhWeVpTQlNiMjkwTUI0WERUSTJNRGd5TkRFMU1UQXlNbG9YRFRNME1URXhNREUxTVRBeU1sb3dOekUxTURNR0ExVUVBd3dzU1VOQlR5QkJjSEJzWlNCT2IyNHRVbVZ1WlhkcGJtY2dSbWw0ZEhWeVpTQkpiblJsY20xbFpHbGhkR1V3V1RBVEJnY3Foa2pPUFFJQkJnZ3Foa2pPUFFNQkJ3TkNBQVRzbm1xaS82VUxTdEc3V1VVb1VtakFWTTBQdUw4WjVEWXZXcVNacXc1R0hJeUVTVUwyUUFhTndSRUdDQkljQktsZUdtQTFiVUJ2NzJySkk4Mnd2ZlIwbzNnd2RqQVNCZ05WSFJNQkFmOEVDREFHQVFIL0FnRUFNQTRHQTFVZER3RUIvd1FFQXdJQkJqQVFCZ29xaGtpRzkyTmtCZ0lCQkFJRkFEQWRCZ05WSFE0RUZnUVVaYjd4WTJMVjRrU1dFdlA4WXluUGtJeWlpcFl3SHdZRFZSMGpCQmd3Rm9BVTlncFY2aWhlTkk1YjlPZitnVFJSeCtqQ2Zna3dDZ1lJS29aSXpqMEVBd0lEUndBd1JBSWdMTGNmdE9OY3diaE90YzRsMlEyeXFQS0hKYU9udDhCZ1kzWXlwTE8vWEI4Q0lDMzJaUEJaNXVXRlZibjVLbEV1ZDhzQWFSM0ZISUVXb24wMDlva2M5Ym1LIiwiTUlJQnhUQ0NBV3lnQXdJQkFnSVVjUG10Uk1jYm0rMHNRbk52TDdGQ0hIcjdTT0l3Q2dZSUtvWkl6ajBFQXdJd0x6RXRNQ3NHQTFVRUF3d2tTVU5CVHlCQmNIQnNaU0JPYjI0dFVtVnVaWGRwYm1jZ1JtbDRkSFZ5WlNCU2IyOTBNQjRYRFRJMk1EZ3lOREUxTVRBeU1sb1hEVE0yTURneU1URTFNVEF5TWxvd0x6RXRNQ3NHQTFVRUF3d2tTVU5CVHlCQmNIQnNaU0JPYjI0dFVtVnVaWGRwYm1jZ1JtbDRkSFZ5WlNCU2IyOTBNRmt3RXdZSEtvWkl6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVudVlXQTBjSzVIWnZFVVdUYVFXVEdqNE9YdFVackxnMk44aTJ1YTZNaVdPdy9MQVRuZmFKY0V2Q2RveDNiTUYra2J0NEt3UUlkdk5sUWhYM3IzTVR1cU5tTUdRd0hRWURWUjBPQkJZRUZQWUtWZW9vWGpTT1cvVG4vb0UwVWNmb3duNEpNQjhHQTFVZEl3UVlNQmFBRlBZS1Zlb29YalNPVy9Ubi9vRTBVY2Zvd240Sk1CSUdBMVVkRXdFQi93UUlNQVlCQWY4Q0FRRXdEZ1lEVlIwUEFRSC9CQVFEQWdFR01Bb0dDQ3FHU000OUJBTUNBMGNBTUVRQ0lFYy8zckZXTWJvZ2M0M1I3TmorMkNBbjFaem1QZ3NaWjhQNzhvUEpLTlFCQWlBOTFSWkUxUXR2eU1sU2FjUGMwTS9VR25IcnY3bmI2ZFgyVXAraHJ3Qm9wQT09Il0sInR5cCI6IkpXVCIsImFsZyI6IkVTMjU2In0.eyJ0cmFuc2FjdGlvbklkIjoiZml4dHVyZS1ub24tcmVuZXdpbmctMSIsIm9yaWdpbmFsVHJhbnNhY3Rpb25JZCI6ImZpeHR1cmUtb3JpZ2luYWwtMSIsImJ1bmRsZUlkIjoiY29tLmV4YW1wbGUiLCJwcm9kdWN0SWQiOiJjb20uZXhhbXBsZS5ub25yZW5ld2luZyIsInB1cmNoYXNlRGF0ZSI6MTc4NzUzMzIwMDAwMCwicXVhbnRpdHkiOjEsInR5cGUiOiJOb24tUmVuZXdpbmcgU3Vic2NyaXB0aW9uIiwiYXBwQWNjb3VudFRva2VuIjoiN2UzZmIyMGItNGNkYi00N2NjLTkzNmQtOTlkNjVmNjA4MTM4Iiwic2lnbmVkRGF0ZSI6MTc4NzUzMzI2MDAwMCwiZW52aXJvbm1lbnQiOiJTYW5kYm94Iiwic3RvcmVmcm9udCI6IkNITiIsInByaWNlIjo2ODAwMCwiY3VycmVuY3kiOiJDTlkifQ.YSj6rRL2f4KUkS6pl2Lw_b6BPVIgGG44wjH8V0n4TutRFECqf5rbKltGoXxb93yCgqsYAqpvlX_DdDVrV16I5A';
const INVALID_SIGNATURE_TRANSACTION = 'eyJ4NWMiOlsiTUlJQm9EQ0NBVWFnQXdJQkFnSUJDekFLQmdncWhrak9QUVFEQWpCTk1Rc3dDUVlEVlFRR0V3SlZVekVUTUJFR0ExVUVDQXdLUTJGc2FXWnZjbTVwWVRFU01CQUdBMVVFQnd3SlEzVndaWEowYVc1dk1SVXdFd1lEVlFRS0RBeEpiblJsY20xbFpHbGhkR1V3SGhjTk1qTXdNVEEwTVRZek56TXhXaGNOTXpJeE1qTXhNVFl6TnpNeFdqQkZNUXN3Q1FZRFZRUUdFd0pWVXpFVE1CRUdBMVVFQ0F3S1EyRnNhV1p2Y201cFlURVNNQkFHQTFVRUJ3d0pRM1Z3WlhKMGFXNXZNUTB3Q3dZRFZRUUtEQVJNWldGbU1Ga3dFd1lIS29aSXpqMENBUVlJS29aSXpqMERBUWNEUWdBRTRyV0J4R21GYm5QSVBRSTB6c0JLekx4c2o4cEQydnFicjB5UElTVXgyV1F5eG1yTnFsOWZoSzhZRUV5WUZWNysrcDVpNFlVU1Ivbzl1UUlnQ1BJaHJLTWZNQjB3Q1FZRFZSMFRCQUl3QURBUUJnb3Foa2lHOTJOa0Jnc0JCQUlUQURBS0JnZ3Foa2pPUFFRREFnTklBREJGQWlFQWtpRVprb0ZNa2o0Z1huK1E5alhRWk1qWjJnbmpaM2FNOE5ZcmdmVFVpdlFDSURKWVowRmFMZTduU0lVMkxXTFRrNXRYVENjNEU4R0pTWWYvc1lSeEVGaWUiLCJNSUlCbHpDQ0FUMmdBd0lCQWdJQkJqQUtCZ2dxaGtqT1BRUURBakEyTVFzd0NRWURWUVFHRXdKVlV6RVRNQkVHQTFVRUNBd0tRMkZzYVdadmNtNXBZVEVTTUJBR0ExVUVCd3dKUTNWd1pYSjBhVzV2TUI0WERUSXpNREV3TkRFMk1qWXdNVm9YRFRNeU1USXpNVEUyTWpZd01Wb3dUVEVMTUFrR0ExVUVCaE1DVlZNeEV6QVJCZ05WQkFnTUNrTmhiR2xtYjNKdWFXRXhFakFRQmdOVkJBY01DVU4xY0dWeWRHbHViekVWTUJNR0ExVUVDZ3dNU1c1MFpYSnRaV1JwWVhSbE1Ga3dFd1lIS29aSXpqMENBUVlJS29aSXpqMERBUWNEUWdBRUZRM2xYMnNxTjlHSXdBaWlNUURRQy9reW5TZ1g0N1J3dmlET3RNWFh2eUtkUWU2Q1BzUzNqbzJ1UkR1RXFBeFdlT2lDcmpsRFdzeXo1d3dkVTBndGFxTWxNQ013RHdZRFZSMFRCQWd3QmdFQi93SUJBREFRQmdvcWhraUc5Mk5rQmdJQkJBSVRBREFLQmdncWhrak9QUVFEQWdOSUFEQkZBaUVBdm56TWNWMjY4Y1JiMS9GcHlWMUVoVDNXRnZPenJCVVdQNi9Ub1RoRmF2TUNJRmJhNXQ2WUt5MFIySkR0eHF0T2pKeTY2bDZWN2QvUHJBRE5wa21JUFcraSIsIk1JSUJYRENDQVFJQ0NRQ2ZqVFVHTERuUjlqQUtCZ2dxaGtqT1BRUURBekEyTVFzd0NRWURWUVFHRXdKVlV6RVRNQkVHQTFVRUNBd0tRMkZzYVdadmNtNXBZVEVTTUJBR0ExVUVCd3dKUTNWd1pYSjBhVzV2TUI0WERUSXpNREV3TkRFMk1qQXpNbG9YRFRNek1ERXdNVEUyTWpBek1sb3dOakVMTUFrR0ExVUVCaE1DVlZNeEV6QVJCZ05WQkFnTUNrTmhiR2xtYjNKdWFXRXhFakFRQmdOVkJBY01DVU4xY0dWeWRHbHViekJaTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEEwSUFCSFB2d1pmb0tMS2FPclgvV2U0cU9iWFNuYTVUZFdIVlo2aElSQTF3MG9jM1FDVDBJbzJwbHlEQjMvTVZsazJ0YzRLR0U4VGlxVzdpYlE2WmM5VjY0azB3Q2dZSUtvWkl6ajBFQXdNRFNBQXdSUUloQU1USGhXdGJBUU4waFN4SVhjUDRDS3JEQ0gvZ3N4V3B4NmpUWkxUZVorRlBBaUIzNW53azVxMHpjSXBlZnZZSjBNVS95R0dIU1dlejBicTBwRFlVTy9ubUR3PT0iXSwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJ0cmFuc2FjdGlvbklkIjoiMjM0NTYiLCJvcmlnaW5hbFRyYW5zYWN0aW9uSWQiOiIxMjM0NSIsIndlYk9yZGVyTGluZUl0ZW1JZCI6IjM0MzQzIiwiYnVuZGxlSWQiOiJjb20uZXhhbXBsZSIsInByb2R1Y3RJZCI6ImNvbS5leGFtcGxlLnByb2R1Y3QiLCJzdWJzY3JpcHRpb25Hcm91cElkZW50aWZpZXIiOiI1NTU1NSIsInB1cmNoYXNlRGF0ZSI6MTY5ODE0ODkwMDAwMCwib3JpZ2luYWxQdXJjaGFzZURhdGUiOjE2OTgxNDg4MDAwMDAsImV4cGlyZXNEYXRlIjoxNjk4MTQ5MDAwMDAwLCJxdWFudGl0eSI6MSwidHlwZSI6IkF1dG8tUmVuZXdhYmxlIFN1YnNjcmlwdGlvbiIsImFwcEFjY291bnRUb2tlbiI6IjdlM2ZiMjBiLTRjZGItNDdjYy05MzZkLTk5ZDY1ZjYwODEzOCIsImluQXBwT3duZXJzaGlwVHlwZSI6IlBVUkNIQVNFRCIsInNpZ25lZERhdGUiOjE2OTgxNDg5MDAwMDAsInJldm9jYXRpb25SZWFzb24iOjEsInJldm9jYXRpb25EYXRlIjoxNjk4MTQ4OTUwMDAwLCJpc1VwZ3JhZGVkIjp0cnVlLCJvZmZlclR5cGUiOjEsIm9mZmVySWRlbnRpZmllciI6ImFiYy4xMjMiLCJlbnZpcm9ubWVudCI6IlNhbmRib3giLCJ0cmFuc2FjdGlvblJlYXNvbiI6IlBVUkNIQVNFIiwic3RvcmVmcm9udCI6IlVTQSIsInN0b3JlZnJvbnRJZCI6IjE0MzQ0MSIsInByaWNlIjoxMDk5MCwiY3VycmVuY3kiOiJVU0QiLCJvZmZlckRpc2NvdW50VHlwZSI6IlBBWV9BU19ZT1VfR08iLCJhcHBUcmFuc2FjdGlvbklkIjoiNzExMzQiLCJvZmZlclBlcmlvZCI6IlAxWSIsImFkdmFuY2VkQ29tbWVyY2VJbmZvIjp7ImRlc2NyaXB0b3JzIjp7ImRlc2NyaXB0aW9uIjoiUHJlbWl1bSBQbGFuIiwiZGlzcGxheU5hbWUiOiJQcmVtaXVtIn0sImVzdGltYXRlZFRheCI6MTUwMCwiaXRlbXMiOlt7IlNLVSI6ImNvbS5leGFtcGxlLnNrdS5wcmVtaXVtIiwiZGVzY3JpcHRpb24iOiJQcmVtaXVtIGZlYXR1cmUiLCJkaXNwbGF5TmFtZSI6IlByZW1pdW0gRmVhdHVyZSIsInByaWNlIjo5OTkwLCJyZWZ1bmRzIjpbeyJyZWZ1bmRBbW91bnQiOjUwMDAsInJlZnVuZERhdGUiOjE2OTgxNDkxMDAwMDAsInJlZnVuZFJlYXNvbiI6IkZVTEZJTExNRU5UX0lTU1VFIiwicmVmdW5kVHlwZSI6IlBST1JBVEVEIn1dLCJyZXZvY2F0aW9uRGF0ZSI6MTY5ODE0OTIwMDAwMH1dLCJwZXJpb2QiOiJQMU0iLCJyZXF1ZXN0UmVmZXJlbmNlSWQiOiJyZWYtMTIzNDUiLCJ0YXhDb2RlIjoiVEFYX0NPREVfMSIsInRheEV4Y2x1c2l2ZVByaWNlIjo4NDkwLCJ0YXhSYXRlIjoiMC4xNSJ9LCJiaWxsaW5nUGxhblR5cGUiOiJNT05USExZIiwiY29tbWl0bWVudEluZm8iOnsiYmlsbGluZ1BlcmlvZE51bWJlciI6MywiY29tbWl0bWVudEV4cGlyZXNEYXRlIjoxNjk4MTUwMDAwMDAwLCJjb21taXRtZW50UHJpY2UiOjExOTg4MCwidG90YWxCaWxsaW5nUGVyaW9kcyI6MTJ9fQ.VPn0jOM7lp0YEysAitMupqlNdooLxezioUXB8LxGKAIPyhWgEgFOyyBz2JCnIGOelWdITDaa7YLSp8OaO7YhdQ';

const VALID_NON_RENEWING_SIGNED_TRANSACTION = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJ0cmFuc2FjdGlvbklkIjoiZml4dHVyZS1ub24tcmVuZXdpbmctdmFsaWQiLCJvcmlnaW5hbFRyYW5zYWN0aW9uSWQiOiJmaXh0dXJlLW9yaWdpbmFsLXZhbGlkIiwiYnVuZGxlSWQiOiJjb20uZXhhbXBsZSIsInByb2R1Y3RJZCI6ImNvbS5leGFtcGxlLm5vbnJlbmV3aW5nIiwicHVyY2hhc2VEYXRlIjoxNzg3NTg3MjAwMDAwLCJxdWFudGl0eSI6MSwidHlwZSI6Ik5vbi1SZW5ld2luZyBTdWJzY3JpcHRpb24iLCJhcHBBY2NvdW50VG9rZW4iOiI3ZTNmYjIwYi00Y2RiLTQ3Y2MtOTM2ZC05OWQ2NWY2MDgxMzgiLCJzaWduZWREYXRlIjoxNzg3NTg3MjYwMDAwLCJlbnZpcm9ubWVudCI6IlNhbmRib3giLCJzdG9yZWZyb250IjoiQ0hOIiwicHJpY2UiOjY4MDAwLCJjdXJyZW5jeSI6IkNOWSJ9',
  'stfx0Jr1VwuiSK61424nMdPkUiSPI5AQKlAss0GyC2LWmUgZrpOTZIQW51VTse340WDFx0roEArnVWEzJJNI-A',
].join('.');
const AUTO_RENEWING_SIGNED_TRANSACTION = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJ0cmFuc2FjdGlvbklkIjoiZml4dHVyZS1hdXRvLXJlbmV3aW5nLXZhbGlkIiwib3JpZ2luYWxUcmFuc2FjdGlvbklkIjoiZml4dHVyZS1hdXRvLW9yaWdpbmFsIiwiYnVuZGxlSWQiOiJjb20uZXhhbXBsZSIsInByb2R1Y3RJZCI6ImNvbS5leGFtcGxlLmF1dG9yZW5ld2luZyIsInB1cmNoYXNlRGF0ZSI6MTc4NzU4NzIwMDAwMCwicXVhbnRpdHkiOjEsInR5cGUiOiJBdXRvLVJlbmV3YWJsZSBTdWJzY3JpcHRpb24iLCJhcHBBY2NvdW50VG9rZW4iOiI3ZTNmYjIwYi00Y2RiLTQ3Y2MtOTM2ZC05OWQ2NWY2MDgxMzgiLCJzaWduZWREYXRlIjoxNzg3NTg3MzIwMDAwLCJlbnZpcm9ubWVudCI6IlNhbmRib3gifQ',
  'GYXFlg5GHBNhQjQoJYdkiucJiIIAnhLv9bChEfeyrpnSEJQu--fWqxau1z84YKQDMDIi13gOX8okWGB2G41g2A',
].join('.');
const QUANTITY_TWO_SIGNED_TRANSACTION = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJ0cmFuc2FjdGlvbklkIjoiZml4dHVyZS1xdWFudGl0eS10d28tdmFsaWQiLCJvcmlnaW5hbFRyYW5zYWN0aW9uSWQiOiJmaXh0dXJlLXF1YW50aXR5LW9yaWdpbmFsIiwiYnVuZGxlSWQiOiJjb20uZXhhbXBsZSIsInByb2R1Y3RJZCI6ImNvbS5leGFtcGxlLm5vbnJlbmV3aW5nIiwicHVyY2hhc2VEYXRlIjoxNzg3NTg3MjAwMDAwLCJxdWFudGl0eSI6MiwidHlwZSI6Ik5vbi1SZW5ld2luZyBTdWJzY3JpcHRpb24iLCJhcHBBY2NvdW50VG9rZW4iOiI3ZTNmYjIwYi00Y2RiLTQ3Y2MtOTM2ZC05OWQ2NWY2MDgxMzgiLCJzaWduZWREYXRlIjoxNzg3NTg3MzgwMDAwLCJlbnZpcm9ubWVudCI6IlNhbmRib3gifQ',
  'HmQEbd-i7FZ6vOgL4aZxoIZ8-HX9Tj5QGtbshw6J28eJoLhlde0i-EqluU3rmpj5fReJh-V4ODYHBpCg6kd9aw',
].join('.');
const SANDBOX_NOTIFICATION_WITHOUT_APP_ID = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJub3RpZmljYXRpb25UeXBlIjoiRElEX1JFTkVXIiwibm90aWZpY2F0aW9uVVVJRCI6IjAwMmUxNGQ1LTUxZjUtNDUwMy1iNWE4LWMzYTFhZjY4ZWIyMCIsInZlcnNpb24iOiIyLjAiLCJzaWduZWREYXRlIjoxNzg3NTg3ODAwMDAwLCJkYXRhIjp7ImVudmlyb25tZW50IjoiU2FuZGJveCIsImJ1bmRsZUlkIjoiY29tLmV4YW1wbGUiLCJidW5kbGVWZXJzaW9uIjoiMS4wLjAifX0',
  'h1sJVZRIIjILWSfQEK6N5yMZLT4KXK7jU7VwNAVU044CEO222rWZ64KHa-QtgCHE8cBxSuwpi1x15JcH5eSPSA',
].join('.');
const SANDBOX_NOTIFICATION_WITH_WRONG_BUNDLE = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJub3RpZmljYXRpb25UeXBlIjoiRElEX1JFTkVXIiwibm90aWZpY2F0aW9uVVVJRCI6IjEwMmUxNGQ1LTUxZjUtNDUwMy1iNWE4LWMzYTFhZjY4ZWIyMCIsInZlcnNpb24iOiIyLjAiLCJzaWduZWREYXRlIjoxNzg3NTg3ODAwMDAwLCJkYXRhIjp7ImVudmlyb25tZW50IjoiU2FuZGJveCIsImJ1bmRsZUlkIjoiY29tLmF0dGFja2VyLndyb25nIiwiYnVuZGxlVmVyc2lvbiI6IjEuMC4wIn19',
  'Tc2zNc5B-X7PfuEF_iR068LWu-cq5p8bMygGQhzh8fTLaR-QLjQMbsJepHIXAYvk9SIKupVe_TDvWUE3qbfHmw',
].join('.');
const PRODUCTION_NOTIFICATION_WITH_WRONG_APP_ID = [
  NON_RENEWING_SIGNED_TRANSACTION.split('.')[0],
  'eyJub3RpZmljYXRpb25UeXBlIjoiRElEX1JFTkVXIiwibm90aWZpY2F0aW9uVVVJRCI6IjIwMmUxNGQ1LTUxZjUtNDUwMy1iNWE4LWMzYTFhZjY4ZWIyMCIsInZlcnNpb24iOiIyLjAiLCJzaWduZWREYXRlIjoxNzg3NTg3ODAwMDAwLCJkYXRhIjp7ImVudmlyb25tZW50IjoiUHJvZHVjdGlvbiIsImFwcEFwcGxlSWQiOjk5OTksImJ1bmRsZUlkIjoiY29tLmV4YW1wbGUiLCJidW5kbGVWZXJzaW9uIjoiMS4wLjAifX0',
  'A5aW3ptE_bvG6q8iU6FGj8EW0MwOTt-Za5VXsr8dHuzJb7Gvg9V8K6kQZhOxk-YPro8QJIsBqT6j67-I4dZXaw',
].join('.');

function verifier(options: { bundleId?: string; root?: Buffer } = {}) {
  return new OfficialAppleStoreVerifier({
    appleRootCertificates: [options.root ?? APPLE_TRANSACTION_FIXTURE_ROOT_CA],
    bundleId: options.bundleId ?? 'com.example',
    appAppleId: 1234,
    enableOnlineChecks: false,
  });
}

async function expectVerificationStatus(
  promise: Promise<unknown>,
  status: VerificationStatus,
) {
  try {
    await promise;
  } catch (cause) {
    expect(cause).toBeInstanceOf(VerificationException);
    expect((cause as VerificationException).status).toBe(status);
    return;
  }
  throw new Error(`expected_apple_verification_failure:${VerificationStatus[status]}`);
}

describe('OfficialAppleStoreVerifier', () => {
  it('verifies the official chain and maps a complete typed transaction', async () => {
    const transaction: VerifiedAppleTransaction = await verifier({
      root: NON_RENEWING_FIXTURE_ROOT_CA,
    }).verifyTransaction(VALID_NON_RENEWING_SIGNED_TRANSACTION);
    const { decodedPayload, ...mapped } = transaction;
    const expected = {
      appAccountToken: '7e3fb20b-4cdb-47cc-936d-99d65f608138',
      bundleId: 'com.example',
      currency: 'CNY',
      environment: 'sandbox',
      originalTransactionId: 'fixture-original-valid',
      priceMilliunits: 68000,
      productId: 'com.example.nonrenewing',
      productType: 'non_renewing_subscription',
      purchaseDate: new Date(1787587200000),
      quantity: 1,
      signedDate: new Date(1787587260000),
      signedPayloadHash: createHash('sha256')
        .update(VALID_NON_RENEWING_SIGNED_TRANSACTION).digest('hex'),
      storefront: 'CHN',
      transactionId: 'fixture-non-renewing-valid',
    } satisfies Omit<VerifiedAppleTransaction, 'decodedPayload'>;
    expect(mapped).toEqual(expected);
    expect(decodedPayload).toMatchObject({
      appAccountToken: expected.appAccountToken,
      bundleId: expected.bundleId,
      environment: 'Sandbox',
      originalTransactionId: expected.originalTransactionId,
      price: expected.priceMilliunits,
      productId: expected.productId,
      transactionId: expected.transactionId,
    });
  });

  it('reports the official VerificationStatus for a wrong trusted root', async () => {
    const header = JSON.parse(Buffer.from(
      VALID_NON_RENEWING_SIGNED_TRANSACTION.split('.')[0]!,
      'base64url',
    ).toString()) as { x5c: string[] };
    await expectVerificationStatus(
      verifier({ root: Buffer.from(header.x5c[0]!, 'base64') })
        .verifyTransaction(VALID_NON_RENEWING_SIGNED_TRANSACTION),
      VerificationStatus.VERIFICATION_FAILURE,
    );
  });

  it('maps a bad ES256 signature to VERIFICATION_FAILURE', async () => {
    await expectVerificationStatus(
      verifier().verifyTransaction(INVALID_SIGNATURE_TRANSACTION),
      VerificationStatus.VERIFICATION_FAILURE,
    );
  });

  it('maps a signed bundle mismatch to INVALID_APP_IDENTIFIER', async () => {
    await expectVerificationStatus(
      verifier({ bundleId: 'com.readyoufife.ios', root: NON_RENEWING_FIXTURE_ROOT_CA })
        .verifyTransaction(VALID_NON_RENEWING_SIGNED_TRANSACTION),
      VerificationStatus.INVALID_APP_IDENTIFIER,
    );
  });

  it('rejects a verified auto-renewable transaction after sandbox fallback', async () => {
    await expect(verifier({ root: NON_RENEWING_FIXTURE_ROOT_CA })
      .verifyTransaction(AUTO_RENEWING_SIGNED_TRANSACTION))
      .rejects.toThrow('apple_transaction_type_invalid');
  });

  it('rejects a verified non-renewing transaction whose quantity is not one', async () => {
    await expect(verifier({ root: NON_RENEWING_FIXTURE_ROOT_CA })
      .verifyTransaction(QUANTITY_TWO_SIGNED_TRANSACTION))
      .rejects.toThrow('apple_transaction_quantity_invalid');
  });

  it('falls back to the sandbox verifier for a signed notification without appAppleId', async () => {
    const notification: VerifiedAppleNotification = await verifier({
      root: NON_RENEWING_FIXTURE_ROOT_CA,
    }).verifyNotification(SANDBOX_NOTIFICATION_WITHOUT_APP_ID);
    expect(notification).toMatchObject({
      environment: 'sandbox',
      notificationUuid: '002e14d5-51f5-4503-b5a8-c3a1af68eb20',
      notificationType: 'DID_RENEW',
      signedDate: new Date(1787587800000),
      signedPayloadHash: createHash('sha256')
        .update(SANDBOX_NOTIFICATION_WITHOUT_APP_ID).digest('hex'),
      transaction: undefined,
    });
    expect(notification.decodedPayload).toMatchObject({
      data: {
        bundleId: 'com.example',
        environment: 'Sandbox',
      },
    });
  });

  it('rejects a signed sandbox notification with a wrong bundle after fallback', async () => {
    await expectVerificationStatus(
      verifier({ root: NON_RENEWING_FIXTURE_ROOT_CA })
        .verifyNotification(SANDBOX_NOTIFICATION_WITH_WRONG_BUNDLE),
      VerificationStatus.INVALID_APP_IDENTIFIER,
    );
  });

  it('rejects a signed production notification with a wrong appAppleId after fallback', async () => {
    await expectVerificationStatus(
      verifier({ root: NON_RENEWING_FIXTURE_ROOT_CA })
        .verifyNotification(PRODUCTION_NOTIFICATION_WITH_WRONG_APP_ID),
      VerificationStatus.INVALID_ENVIRONMENT,
    );
  });
});
