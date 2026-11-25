"""
Application roles.

These three roles are used consistently across the entire project
(DB model, JWT claims, FastAPI route dependencies, and the frontend
auth context). There is no CUSTOMER role in this application.

ADMIN         — user mgmt, product mgmt, dataset mgmt, model mgmt,
                pricing constraints, system analytics, audit logs
ANALYST       — sentiment analytics, demand forecasting, dynamic
                pricing, competitor intelligence, inventory
                intelligence, price simulator, reports, model performance
BUSINESS_USER — dashboard, products, reviews, sentiment insights,
                pricing insights, demand forecasts, price simulator,
                AI copilot

This file is not wired into any endpoint yet (that's Phase 1) — it
exists now purely so the role names are defined in exactly one place
and nothing downstream has to guess at them.
"""
from enum import Enum


class Role(str, Enum):
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    BUSINESS_USER = "BUSINESS_USER"


ALL_ROLES = [Role.ADMIN, Role.ANALYST, Role.BUSINESS_USER]
