"""
Competitor price ORM model.

Per the project's architecture decisions: competitor pricing is
simulated/CSV-seeded data, NOT live scraping (scraping is legally
grey and unreliable for a live demo). ADMIN imports a CSV of
competitor prices per product; the pricing model treats this exactly
like any other real input signal — it doesn't care where the number
came from, only that it's a real row in the database.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal

from app.db.session import Base


class CompetitorPrice(Base):
    __tablename__ = "competitor_prices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    competitor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
