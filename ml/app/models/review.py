"""
Review ORM model.

Phase 2 added raw review content + rating. Phase 3 adds the fields
populated by the real NLP pipeline (sentiment, emotion, fake-review
score) — all nullable, because they start empty and are filled in
asynchronously by app.services.review_analysis after the review is
created. A review with null sentiment fields means "not yet analyzed",
never "analyzed and the result was fabricated."

Aspect-based sentiment (per-aspect breakdown, e.g. "battery": negative)
lives in its own table, ReviewAspectSentiment, since one review can
surface zero or many aspects.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating >= 1 AND rating <= 5", name="ck_reviews_rating_range"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)

    reviewer_display_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # --- Phase 3: NLP pipeline output. All nullable — populated after
    # analysis runs, never defaulted to a placeholder value. ---
    sentiment_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    emotion_label: Mapped[str | None] = mapped_column(String(30), nullable=True)
    emotion_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    fake_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    product: Mapped["Product"] = relationship("Product", back_populates="reviews")  # noqa: F821
    aspects: Mapped[list["ReviewAspectSentiment"]] = relationship(
        "ReviewAspectSentiment", back_populates="review", cascade="all, delete-orphan"
    )


class ReviewAspectSentiment(Base):
    """
    One row per (review, aspect) pair, e.g. review X mentions "battery"
    with negative sentiment and "screen" with positive sentiment.
    Produced by app.services.absa_service — never hand-authored.
    """

    __tablename__ = "review_aspect_sentiments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False, index=True
    )
    aspect: Mapped[str] = mapped_column(String(50), nullable=False)
    sentiment_label: Mapped[str] = mapped_column(String(20), nullable=False)
    sentiment_score: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_text: Mapped[str] = mapped_column(Text, nullable=False)

    review: Mapped["Review"] = relationship("Review", back_populates="aspects")
