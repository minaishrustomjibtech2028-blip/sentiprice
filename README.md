# SentiPrice AI

Product-review sentiment analysis, demand forecasts, and dynamic pricing for an
e-commerce catalogue. The app uses React and TypeScript, a Java 21 Spring Boot
API, and PostgreSQL.

## Run the project

1. Extract the ZIP and open a terminal inside the `project 5` folder.
2. Start Docker Desktop, or start Docker Engine with the Compose plugin.
3. Run:

   ```bash
   docker compose up --build
   ```

4. Open [SentiPrice AI](http://localhost:5173). Choose **Create your account**
   to register and sign in as a Business User.

### Local presentation accounts

On the Mac holding your existing `project6` database, start presentation mode
from the extracted project folder:

```bash
PRESENTATION_ACCOUNTS=true docker compose -p project6 up --build -d --wait
```

Use the regular sign-in page. The Admin email is `admin@sentiprice.ai` and the
Analyst email is `analyst@sentiprice.ai`. Both use `Demo@1234` unless an existing
account already has a private password. Public sign-up creates Business User
accounts. Compose binds these services to localhost for local use.

### Built-in admin

Set these values in a `.env` file next to `docker-compose.yml` before starting
the backend. Use a private password of at least 12 characters.

```dotenv
ADMIN_EMAIL=admin@sentiprice.ai
ADMIN_PASSWORD=
```

The backend creates the admin on startup when a password is set. Sign in on the
regular login page using the configured email and password. Existing custom
admin credentials still work. Earlier demo accounts using the shared demo
password are disabled outside presentation mode, and the default demo admin is upgraded if that email
and a new password are configured. Choose an unused email if your desired
address already belongs to an ordinary account.

To add optional sample inventory, run
`docker compose run --rm backend --seed-demo=true`. Add `--with-reviews` to
populate and analyze sample reviews.

The catalogue loads on first startup. A fresh database gets 808 products across
20 categories, including 768 selected from the Amazon 2023 dataset. A database
with the original Amazon import keeps its existing catalogue. See
[Catalogue expansion](docs/catalogue-expansion.md) for the source and selection.

The Java backend creates or updates the PostgreSQL schema on startup. Existing
tables, bcrypt passwords, and uploaded image paths remain compatible. Reuse the
existing PostgreSQL volume and copy any old `backend/uploads` files into the
same folder in this archive when upgrading an existing installation. Compose
uses the folder name to derive its default project and volume names.

API health is at [localhost:8000/api/v1/health](http://localhost:8000/api/v1/health).
Swagger UI is at [localhost:8000/docs](http://localhost:8000/docs). Use
`docker compose down` to stop the services and retain the database.

The demand and fake-review models ship with the project. On first startup, the backend
preloads compact sentiment and emotion models from Hugging Face
(about 150 MB total), then reuses the Docker cache. If a download fails, check
`docker compose logs backend` and use the review's reanalysis action as an
Admin or Analyst after connectivity is restored.

## Roles

| Role | Access |
|---|---|
| Admin | Product, CSV and image management, account administration, analytics, pricing, inventory and competitors |
| Analyst | Analytics, pricing recommendations, price simulation, inventory and competitor views |
| Business User | Catalogue, reviews, sentiment summaries, alerts and demand forecasts |

## Run outside Docker

Use Java 21, Maven 3.9, curl, PostgreSQL and Node 20+. Export the settings in
`backend/.env.example` for your database, then start each service in its own
terminal:

```bash
cd backend
mvn spring-boot:run
```

```bash
cd frontend
npm ci
npm run dev
```

## Offline tools

The Python code in `ml/` is for optional model training and catalogue preparation.
From `ml/`, use a Python virtual environment and install `requirements.txt`.
The demand training and catalogue commands use the running PostgreSQL database
and read its connection details from environment variables or `ml/.env`.

```bash
python -m src.generate_demand_history
python -m src.train_demand_forecast_model
python -m src.train_fake_review_model
```

Training exports the model JSON used by the Java backend. Rebuild the backend
after retraining. See [Catalogue expansion](docs/catalogue-expansion.md) for the
optional Amazon dataset workflow. [Architecture](docs/architecture.md) records
the original Python implementation and project design history.

Prices are stored in USD and shown in INR. The frontend sets the conversion
rate in `frontend/src/lib/money.ts`, or via `VITE_USD_TO_INR` in its environment.
