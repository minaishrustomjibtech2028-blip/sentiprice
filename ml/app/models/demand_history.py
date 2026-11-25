"""
Demand history ORM model — one row per (product, date), the units
sold that day and the price in effect at the time.

There is no real historical sales system feeding this project (no
payment/checkout flow exists), so this table is seeded with
documented synthetic data (see ml/data/generate_demand_history.py)
that is influenced by price and a simulated seasonality/sentiment
signal — a standard, defensible technique for a project at this
scope, exactly like the fake-review training set. Once seeded, the
forecasting model treats these as ordinary real database rows; the
model training/inference code has no knowledge that the rows are
synthetic.
"""
import uuid
from datetime import date as date_type

from sqlalchemy import Integer, Numeric, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal

from app.db.session import Base


class DemandHistory(Base):
    __tablename__ = "demand_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    record_date: Mapped[date_type] = mapped_column(Date, nullable=False, index=True)
    units_sold: Mapped[int] = mapped_column(Integer, nullable=False)
    price_at_time: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
