/*
    Copyright 2022 Camptocamp SA
    License AGPL-3.0 or later (https://www.gnu.org/licenses/agpl)
*/

import {ProductScreen} from "@point_of_sale/app/screens/product_screen/product_screen";
import {_t} from "@web/core/l10n/translation";
import {patch} from "@web/core/utils/patch";
import {useBarcodeReader} from "@point_of_sale/app/hooks/barcode_reader_hook";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        useBarcodeReader({
            lot: this._barcodeLotAction,
        });
    },
    async _barcodeLotAction(code) {
        // Get the product according to lot barcode
        const product = await this._getProductByLotBarcode(code);
        // If we didn't get a product it must display a popup
        if (!product) {
            this.sound.play("error");
            this.barcodeReader.showNotFoundNotification(code);
            return;
        }
        if (product instanceof Array) {
            // If we found more than a single lot in backend, raise error
            const productNamesString = product
                .map(
                    (lot) => this.pos.models["product.product"].get(lot.product_id).name
                )
                .join(", ");
            this.notification.add(
                _t(
                    'The Point of Sale can not process the scanned barcode, as it matches multiple products: "%s".',
                    productNamesString
                ),
                {
                    type: "warning",
                    title: _t(
                        'Multiple Products Matching Barcode: "%s".',
                        code.base_code
                    ),
                }
            );
            return;
        }
        // A variant whose product.template is not in the local model cannot be added to
        // an order: core reads the template to build the line, and the modules overriding
        // addLineToCurrentOrder (pos_sale, pos_loyalty) dereference it without checking.
        const productTemplate = product.product_tmpl_id;
        if (!productTemplate) {
            this.sound.play("error");
            this.barcodeReader.showNotFoundNotification(code);
            return;
        }
        await this.pos.addLineToCurrentOrder(
            {product_id: product, product_tmpl_id: productTemplate},
            {code},
            productTemplate.needToConfigure()
        );
        this.numberBuffer.reset();
        this.showOptionalProductPopupIfNeeded(productTemplate);
    },
    async _getProductByLotBarcode(base_code) {
        const foundLotIds = await this._searchLotProduct(base_code.code);
        if (foundLotIds.length === 1) {
            const productId = foundLotIds[0].product_id;
            let product = this.pos.models["product.product"].get(productId);
            if (!product || !product.product_tmpl_id) {
                // Load the product template together with its variants, the way the core
                // barcode action does. Reading the variant on its own can leave it in the
                // local model without its template (a stale or partial reload of the
                // product data does the same), and such a variant cannot be sold.
                await this.pos.loadNewProducts([
                    ["product_variant_ids.id", "in", [productId]],
                    ["available_in_pos", "=", true],
                ]);
                product = this.pos.models["product.product"].get(productId);
                if (!product || !product.product_tmpl_id) {
                    // Not available in POS
                    return false;
                }
                await this.pos.processProductAttributes();
            }
            return product;
        } else if (foundLotIds.length > 1) {
            return foundLotIds;
        }
        return false;
    },
    async _searchLotProduct(code) {
        const foundLotIds = await this.pos.data.searchRead(
            "stock.lot",
            [["name", "=", code]],
            ["id", "product_id"],
            {
                order: "id desc",
                limit: 2,
            }
        );
        return foundLotIds;
    },
});
