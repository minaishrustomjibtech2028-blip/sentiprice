"""
Product ORM model.

`category` is a free-text field, not a foreign key to a lookup table.
This is a deliberate simplicity choice: it lets an ADMIN introduce a
new category just by typing it on a product (no migration, no admin
screen for "manage categories") while still being fully filterable
and groupable in queries and the frontend. If category taxonomy
governance becomes a real requirement later, this can be normalized
into its own table without changing the API shape much.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import String, Numeric, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relative URL (e.g. "/media/products/<uuid>.jpg") of an admin-uploaded
    # image. Null means "no upload" -> the UI renders a generated,
    # category-specific placeholder instead.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    current_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    reviews: Mapped[list["Review"]] = relationship(  # noqa: F821
        "Review", back_populates="product", cascade="all, delete-orphan"
    )
