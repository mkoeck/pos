/* global posmodel */

import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as PaymentScreen from "@point_of_sale/../tests/pos/tours/utils/payment_screen_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";
import * as ReceiptScreen from "@point_of_sale/../tests/pos/tours/utils/receipt_screen_util";
import {registry} from "@web/core/registry";
import {scan_barcode} from "@point_of_sale/../tests/generic_helpers/utils";

registry.category("web_tour.tours").add("LotScanningTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),

            // Add a product with its Lot
            scan_barcode("10120000515"),
            ProductScreen.selectedOrderlineHas("Lot Product 1"),

            scan_barcode("10120000516"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.trackingMethodIsLot("10120000515"),
            Chrome.endTour(),
        ].flat(),
});

registry.category("web_tour.tours").add("LotScanningInsteadofInputTour", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            ProductScreen.clickDisplayedProduct("Lot Product 1"),
            scan_barcode("10120000515"),
            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.trackingMethodIsLot("10120000515"),
        ].flat(),
});

registry.category("web_tour.tours").add("LotScanningTourLimitedProductCount", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),

            // Add a product with its Lot
            scan_barcode("10120000517"),
            ProductScreen.selectedOrderlineHas("Lot Product 3"),

            ProductScreen.clickPayButton(),
            PaymentScreen.clickPaymentMethod("Cash"),
            PaymentScreen.clickValidate(),
            ReceiptScreen.trackingMethodIsLot("10120000517"),
            Chrome.endTour(),
        ].flat(),
});

// Scanning a lot must work even when the register holds the variant but cannot resolve
// its product.template locally, which is the state a stale/partial product reload leaves
// behind (IndexedDB leftovers, a dropped `load_product_from_pos` answer). The lot action
// used to forward `product.product_tmpl_id` (= undefined in that state) to
// `addLineToCurrentOrder`, where the pos_sale/pos_loyalty overrides dereference it.
registry.category("web_tour.tours").add("LotScanningTourStaleProductTemplate", {
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            {
                content: "leave the register with a variant whose template is not loaded",
                trigger: ".pos",
                run: async () => {
                    const [lot] = await posmodel.data.searchRead(
                        "stock.lot",
                        [["name", "=", "10120000517"]],
                        ["id", "product_id"]
                    );
                    // Make sure the lot's variant is in the local store, then drop the
                    // template record so the variant can no longer resolve it.
                    await posmodel.loadNewProducts([
                        ["product_variant_ids.id", "in", [lot.product_id]],
                    ]);
                    const product = posmodel.models["product.product"].get(
                        lot.product_id
                    );
                    posmodel.models["product.template"].delete(product.product_tmpl_id, {
                        silent: true,
                    });
                },
            },
            scan_barcode("10120000517"),
            ProductScreen.selectedOrderlineHas("Lot Product 3"),
            Chrome.endTour(),
        ].flat(),
});
