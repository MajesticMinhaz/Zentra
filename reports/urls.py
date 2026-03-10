from django.urls import path
from .views import (
    RevenueByMonthReport,
    OutstandingInvoicesReport,
    CustomerBalanceReport,
    TaxSummaryReport,
    MRRReport,
    RevenueReportPDF,
    PaymentMethodBreakdownReport,
    TopCustomersByRevenueReport,
    InvoiceFunnelReport,
    OutstandingInvoicesReportPDF,
    TaxSummaryReportPDF,
)

urlpatterns = [
    path("reports/revenue-by-month/",       RevenueByMonthReport.as_view(),         name="report-revenue"),
    path("reports/outstanding-invoices/",   OutstandingInvoicesReport.as_view(),    name="report-outstanding"),
    path("reports/customer-balances/",      CustomerBalanceReport.as_view(),        name="report-customer-balances"),
    path("reports/tax-summary/",            TaxSummaryReport.as_view(),             name="report-tax-summary"),
    path("reports/mrr/",                    MRRReport.as_view(),                    name="report-mrr"),
    path("reports/revenue-pdf/",            RevenueReportPDF.as_view(),             name="report-revenue-pdf"),
    path("reports/payment-methods/",        PaymentMethodBreakdownReport.as_view(), name="report-payment-methods"),
    path("reports/top-customers/",          TopCustomersByRevenueReport.as_view(),  name="report-top-customers"),
    path("reports/invoice-funnel/",         InvoiceFunnelReport.as_view(),          name="report-invoice-funnel"),
    path("reports/outstanding-pdf/",        OutstandingInvoicesReportPDF.as_view(), name="report-outstanding-pdf"),
    path("reports/tax-summary-pdf/",        TaxSummaryReportPDF.as_view(),          name="report-tax-summary-pdf"),
]