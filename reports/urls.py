from django.urls import path
from .views import (
    RevenueByMonthReport,
    OutstandingInvoicesReport,
    CustomerBalanceReport,
    TaxSummaryReport,
    MRRReport,
    RevenueReportPDF,
)

urlpatterns = [
    path("reports/revenue-by-month/", RevenueByMonthReport.as_view(), name="report-revenue"),
    path("reports/outstanding-invoices/", OutstandingInvoicesReport.as_view(), name="report-outstanding"),
    path("reports/customer-balances/", CustomerBalanceReport.as_view(), name="report-customer-balances"),
    path("reports/tax-summary/", TaxSummaryReport.as_view(), name="report-tax-summary"),
    path("reports/mrr/", MRRReport.as_view(), name="report-mrr"),
    path("reports/revenue-pdf/", RevenueReportPDF.as_view(), name="report-revenue-pdf"),
]
