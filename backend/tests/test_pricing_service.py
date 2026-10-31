from decimal import Decimal

import pytest

from app.services.pricing_service import PriceLineInput, calculate_pricing


def test_decimal_pricing_with_variant_tax_and_discount():
    result = calculate_pricing(
        [PriceLineInput(unit_price=Decimal("10.00"), extra_price=Decimal("2.50"), quantity=Decimal("2"), percentage_tax_rates=(Decimal("10"),))],
        discount_type="percentage", discount_value=Decimal("10"),
    )
    assert result.subtotal == Decimal("25.00")
    assert result.discount == Decimal("2.50")
    assert result.tax == Decimal("2.25")
    assert result.total == Decimal("24.75")


def test_fixed_discount_is_capped_at_subtotal():
    result = calculate_pricing([PriceLineInput(unit_price=Decimal("5"))], discount_type="fixed", discount_value=Decimal("20"))
    assert result.discount == Decimal("5.00")
    assert result.total == Decimal("0.00")


def test_zero_or_negative_quantity_rejected():
    with pytest.raises(ValueError):
        calculate_pricing([PriceLineInput(unit_price=Decimal("10"), quantity=Decimal("0"))])
