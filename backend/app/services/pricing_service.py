"""Decimal-only pricing calculations shared by previews and billing."""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

CENT = Decimal("0.01")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PriceLineInput:
    unit_price: Decimal
    quantity: Decimal = Decimal("1")
    extra_price: Decimal = Decimal("0")
    fixed_tax_per_unit: Decimal = Decimal("0")
    percentage_tax_rates: tuple[Decimal, ...] = ()
    discount_eligible: bool = True


@dataclass(frozen=True)
class PriceLineResult:
    quantity: Decimal
    unit_price: Decimal
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal


@dataclass(frozen=True)
class PriceResult:
    lines: tuple[PriceLineResult, ...]
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal


def calculate_pricing(
    lines: Iterable[PriceLineInput],
    *,
    discount_type: str | None = None,
    discount_value: Decimal = Decimal("0"),
) -> PriceResult:
    inputs = list(lines)
    raw_subtotals: list[Decimal] = []
    for line in inputs:
        qty = Decimal(str(line.quantity))
        if qty <= 0:
            raise ValueError("Quantity must be greater than zero")
        raw_subtotals.append((Decimal(str(line.unit_price)) + Decimal(str(line.extra_price))) * qty)
    subtotal = money(sum(raw_subtotals, Decimal("0")))
    eligible_subtotal = money(sum((amount for line, amount in zip(inputs, raw_subtotals) if line.discount_eligible), Decimal("0")))
    if discount_type == "percentage":
        if discount_value < 0 or discount_value > 100:
            raise ValueError("Percentage discount must be between 0 and 100")
        discount = money(eligible_subtotal * discount_value / Decimal("100"))
    elif discount_type == "fixed":
        discount = min(eligible_subtotal, money(discount_value))
    elif discount_type is None:
        discount = Decimal("0.00")
    else:
        raise ValueError("Unsupported discount type")

    results = []
    total_tax = Decimal("0")
    for line, raw in zip(inputs, raw_subtotals):
        line_subtotal = money(raw)
        # Spread a whole-subscription discount proportionally to keep tax bases accurate.
        line_discount = money(discount * line_subtotal / eligible_subtotal) if subtotal and eligible_subtotal and line.discount_eligible else Decimal("0.00")
        taxable = max(Decimal("0"), line_subtotal - line_discount)
        tax = money(taxable * sum((Decimal(str(rate)) for rate in line.percentage_tax_rates), Decimal("0")) / Decimal("100"))
        tax += money(Decimal(str(line.fixed_tax_per_unit)) * Decimal(str(line.quantity)))
        total_tax += tax
        results.append(PriceLineResult(Decimal(str(line.quantity)), money(line.unit_price + line.extra_price), line_subtotal, line_discount, tax, money(taxable + tax)))
    return PriceResult(tuple(results), subtotal, discount, money(total_tax), money(subtotal - discount + total_tax))
