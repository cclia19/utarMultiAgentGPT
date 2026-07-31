import fs from "node:fs";
import tls from "node:tls";
import { Agent } from "undici";
import { UTAR_DIRECTORY_CA_CHAIN } from "./certs/utarDirectoryChain.ts";

/**
 * Provides a lazy undici Agent dispatcher configured with the CA chain needed
 * to verify TLS connections to www2.utar.edu.my.
 *
 * UTAR's server presents a certificate chain that Node's default trust store
 * cannot verify (UNABLE_TO_VERIFY_LEAF_SIGNATURE). To allow fetch() to succeed
 * without disabling TLS verification globally, we construct an undici Agent
 * with an explicit CA list combining Node's default root certificates, the
 * Sectigo intermediate and root certificates required by UTAR, and any custom CA
 * specified in process.env.NODE_EXTRA_CA_CERTS.
 *
 * These intermediate and root certificates are public CA certificates, not secrets.
 */

let dispatcher: Agent | null = null;

export function getDirectoryDispatcher(): Agent {
    if (!dispatcher) {
        const ca: string[] = Array.from(tls.rootCertificates);

        const certMatches = UTAR_DIRECTORY_CA_CHAIN.match(
            /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
        );
        if (certMatches) {
            ca.push(...certMatches);
        }

        if (process.env.NODE_EXTRA_CA_CERTS) {
            try {
                const extraCa = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8");
                if (extraCa) {
                    ca.push(extraCa);
                }
            } catch {
                // Silently ignore failure reading NODE_EXTRA_CA_CERTS
            }
        }

        dispatcher = new Agent({
            connect: {
                ca,
            },
        });
    }

    return dispatcher;
}
