# Sankofa repository operations

Sankofa is a self-contained AIMS repository. It does not require DSpace accounts, DSpace hosting or a DSpace service. Sankofa owns the catalogue, user accounts, workflow, metadata, durable bitstreams and audit events.

## First administrator

Set `LA_BOOTSTRAP_ADMIN_EMAIL` and `LA_BOOTSTRAP_ADMIN_PASSWORD` before the first deployment. The first startup creates that approved AIMS administrator. Remove the password from the deployment secret after initialization and use the administration interface for future account approvals.

Users create Sankofa accounts at `/login` and wait for AIMS approval. Password reset requests must be connected to the institution's email provider before production; development mode returns a reset token only when secure cookies are disabled.

## Repository model

Communities contain collections. Collections contain submissions. A submission stores structured roadmap metadata, one or more bitstreams, checksum, licence, access state and optional embargo date. New submissions are `submitted`; librarians can accept or return them; editors or administrators publish them. Published records are available through Sankofa search, downloads, citations, AI questions and the knowledge graph. Withdrawn records remain auditable but are removed from public search and AI derivatives.

The SQLite catalogue is suitable for a single-node deployment and tests. For institutional scale, place the repository database on PostgreSQL through the same repository-store interface and place `LA_REPOSITORY_STORAGE_PATH` on versioned AIMS object storage or a replicated filesystem. Never store authoritative files only inside a disposable container.

## AI indexing policy

Only published, non-withdrawn records with permitted access are eligible for indexing. A correction reuses the stable Sankofa item ID and replaces its graph concepts and vector. A withdrawal or access restriction removes the graph/vector derivative and records an audit event. AI answers must link back to the Sankofa record and must not expose restricted files.

## Deployment, backup and restore

```bash
cp .env.example .env
# set a random LA_SESSION_SECRET and the bootstrap administrator values
make deploy
```

Back up `LA_REPOSITORY_DB_PATH`, `LA_REPOSITORY_STORAGE_PATH`, the Sankofa event/audit files, Neo4j and Qdrant volumes. Restore into a disposable environment first, verify one public record, one restricted/embargoed record, download, workflow approval, withdrawal, password reset and AI derivative removal, then promote the restored services.

The repository CSV migration command remains available through `sankofa metadata import`. It creates validated metadata records; files must be migrated into Sankofa's configured durable storage and then reviewed through the normal workflow.

The UI retains English/French labels, keyboard navigation, visible focus, semantic form labels and responsive workflows. Test signup, approval, deposit, review, publish, download and withdrawal in both languages before launch.
