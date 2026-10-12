# LARAS

LARAS is a learning-management app for course planning, assignments, lecturer assessment and personalized student practice. It uses a React Router web app and PocketBase for authentication, records and uploaded files.

**New engineer? Start with the [engineering handbook](docs/engineering/README.md).** It includes architecture, feature/data flows, AI providers, every registered route, source dependencies, migrations, configuration and deployment instructions.

- [Architecture](docs/engineering/architecture.md)
- [Feature guide](docs/engineering/features.md)
- [Data model](docs/engineering/data-model.md)
- [AI and evidence](docs/engineering/ai-and-evidence.md)
- [Development and operations](docs/engineering/operations.md)
- [Source atlas](docs/engineering/source-atlas.md)

## Quick start

```sh
npm ci
# Configure a private .env with local PocketBase credentials first.
docker compose -f docker-compose.local.yml up --build -d
```

Open `http://localhost:3000`. Read the [setup details](docs/engineering/operations.md) for environment loading, backend architecture and local file-link caveats. No credentials or production records belong in Git.
