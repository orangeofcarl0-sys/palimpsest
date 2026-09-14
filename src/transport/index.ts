/** G10-P durable peer transport: mechanical substrate + inbound pump (semantics stay Palimpsest's). */

export {
  DURABLE_ENVELOPE_DOMAIN,
  TRANSPORT_NAMESPACE_PREFIX,
  DurableEnvelopeError,
  parseDurablePeerOperation,
  parseDurablePeerEnvelope,
  materializeDurablePeerEnvelope,
  durableEnvelopeDigestOf,
  durableOperationDigestOf,
  mailboxNamespace,
  type DurablePeerOperation,
  type DurablePeerEnvelope,
} from "./envelope.js";

export {
  DurableTransportError,
  makeOrdariumDurableTransport,
  ordariumDurableTransportAt,
  defaultTransportLedgerPath,
  type DurableOperationTransportPort,
  type DurableOperationTransport,
  type DurableOperationSubmitRequest,
  type DurableTransportObservation,
  type OrdariumDurableTransportOptions,
} from "./ordarium_transport.js";

export {
  SqliteTransportCursorStore,
  defaultTransportCursorPath,
  type TransportCursorStore,
} from "./cursor_store.js";

export {
  peerTransportFromDurable,
  durableBoundaryClient,
  defaultHomePeerOf,
  type DurableBoundaryClient,
} from "./adapters.js";

export {
  InboundPumpError,
  makeFederationInboundPump,
  type FederationRemoteIngestPort,
  type BoundaryHomeIngestPort,
  type FederationInboundPump,
  type InboundPumpOptions,
  type InboundPumpStatus,
  type InboundPumpStats,
} from "./pump.js";
