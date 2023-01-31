function byteArrayToLong(byteArray) {
    let value = 0;
    for (let i = byteArray.length - 1; i >= 0; i--) {
        value = value * 256 + byteArray[i];
    }
    return value;
}

function encodeLong(n) {
    let buf = new Uint8Array(0);
    let f, m;
    let offset = 0;

    if (n >= -1073741824 && n < 1073741824) {
        // Won't overflow, we can use integer arithmetic.
        m = n >= 0 ? n << 1 : (~n << 1) | 1;
        do {
            buf = ArweaveUtils.concatBuffers([buf, new Uint8Array(1)]);
            buf[offset] = m & 0x7f;
            m >>= 7;
        } while (m && (buf[offset++] |= 0x80));
    } else {
        // We have to use slower floating arithmetic.
        f = n >= 0 ? n * 2 : -n * 2 - 1;
        do {
            buf = ArweaveUtils.concatBuffers([buf, new Uint8Array(1)]);
            buf[offset] = f & 0x7f;
            f /= 128;
        } while (f >= 1 && (buf[offset++] |= 0x80));
    }
    return buf;
}


function serializeTags(tags) {
    const encoder = new TextEncoder();
    let byt = encoder.encode("");
    if (!tags) return byt;
    // number of tags
    byt = ArweaveUtils.concatBuffers([byt, encodeLong(tags.length)]);
    for (const tag of tags) {
        if (!tag?.name || !tag?.value)
            throw new Error(
                `Invalid tag format for ${tag}, expected {name:string, value: string}`,
            );
        const name = encoder.encode(tag.name);
        const value = encoder.encode(tag.value);
        // encode the length of the field using variable integer encoding
        byt = ArweaveUtils.concatBuffers([byt, encodeLong(name.byteLength)]);
        // then the value
        byt = ArweaveUtils.concatBuffers([byt, name]);
        byt = ArweaveUtils.concatBuffers([byt, encodeLong(value.byteLength)]);
        byt = ArweaveUtils.concatBuffers([byt, value]);
    }
    // 0 terminator
    byt = ArweaveUtils.concatBuffers([byt, encodeLong(0)]);
    return byt;
}

async function deepHash(data) {
    const Arweave = {
        utils: ArweaveUtils,
        crypto: SmartWeave.arweave.crypto
    }

    if (
        typeof data[Symbol.asyncIterator] ===
        "function"
    ) {
        const _data = data;

        //const context = createHash("sha384");
        let shaContent = '';

        let length = 0;

        for await (const chunk of _data) {
            length += chunk.byteLength;
            shaContent += `${chunk}`;
        }

        const tag = Arweave.utils.concatBuffers([
            Arweave.utils.stringToBuffer("blob"),
            Arweave.utils.stringToBuffer(length.toString()),
        ]);

        const taggedHash = Arweave.utils.concatBuffers([
            await Arweave.crypto.hash(tag, "SHA-384"),
            await Arweave.crypto.hash(shaContent, "SHA-384"),
        ]);

        return await Arweave.crypto.hash(taggedHash, "SHA-384");
    } else if (Array.isArray(data)) {
        const tag = Arweave.utils.concatBuffers([
            Arweave.utils.stringToBuffer("list"),
            Arweave.utils.stringToBuffer(data.length.toString()),
        ]);

        return await deepHashChunks(
            data,
            await Arweave.crypto.hash(tag, "SHA-384"),
        );
    }

    const _data = data;

    const tag = Arweave.utils.concatBuffers([
        Arweave.utils.stringToBuffer("blob"),
        Arweave.utils.stringToBuffer(_data.byteLength.toString()),
    ]);

    const taggedHash = Arweave.utils.concatBuffers([
        await Arweave.crypto.hash(tag, "SHA-384"),
        await Arweave.crypto.hash(_data, "SHA-384"),
    ]);

    return await Arweave.crypto.hash(taggedHash, "SHA-384");
}

async function deepHashChunks(
    chunks,
    acc,
) {

    if (chunks.length < 1) {
        return acc;
    }

    const hashPair = ArweaveUtils.concatBuffers([
        acc,
        await deepHash(chunks[0]),
    ]);
    const newAcc = await SmartWeave.arweave.crypto.hash(hashPair, "SHA-384");
    return await deepHashChunks(chunks.slice(1), newAcc);
}

function shortTo2ByteArray(long) {
    if (long > (2 ^ (32 - 1))) throw new Error("Short too long");
    // we want to represent the input as a 8-bytes array
    const byteArray = [0, 0];

    for (let index = 0; index < byteArray.length; index++) {
        const byte = long & 0xff;
        byteArray[index] = byte;
        long = (long - byte) / 256;
    }

    return Uint8Array.from(byteArray);
}

function longTo8ByteArray(long) {
    // we want to represent the input as a 8-bytes array
    const byteArray = [0, 0, 0, 0, 0, 0, 0, 0];

    for (let index = 0; index < byteArray.length; index++) {
        const byte = long & 0xff;
        byteArray[index] = byte;
        long = (long - byte) / 256;
    }

    return Uint8Array.from(byteArray);
}

async function getSignatureData(item) {
    // ContractAssert(false, JSON.stringify(item, null, 2));
    const encoder = new TextEncoder();
    return deepHash([
        encoder.encode("dataitem"),
        encoder.encode("1"),
        encoder.encode(item.signatureType.toString()),
        item.rawOwner,
        item.rawTarget || new Uint8Array(0),
        item.rawAnchor || new Uint8Array(0),
        item.rawTags,
        item.rawData,
    ]);
}

async function getSignatureAndId(
    item,
    signer,
) {

    const signatureData = await getSignatureData(item);

    const signatureBytes = await signer.sign(signatureData);
    const idBytes = await SmartWeave.arweave.crypto.hash(signatureBytes);

    return { signature: signatureBytes, id: idBytes };
}

function createData(data, signer, opts) {
    const encoder = new TextEncoder();
    // TODO: Add asserts
    // Parse all values to a buffer and
    const _owner = signer.publicKey;

    const _target = opts?.target ? SmartWeave.arweave.utils.b64UrlToBuffer(opts.target) : null;
    const target_length = 1 + (_target?.byteLength ?? 0);
    const _anchor = opts?.anchor ? new Uint8Array(opts.anchor) : null;
    const anchor_length = 1 + (_anchor?.byteLength ?? 0);
    const _tags = (opts?.tags?.length ?? 0) > 0 ? serializeTags(opts.tags) : null;
    const tags_length = 16 + (_tags ? _tags.byteLength : 0);
    const _data = data;
    const data_length = _data.byteLength;

    // See [https://github.com/joshbenaron/arweave-standards/blob/ans104/ans/ANS-104.md#13-dataitem-format]
    const length =
        2 +
        signer.signatureLength +
        signer.ownerLength +
        target_length +
        anchor_length +
        tags_length +
        data_length;
    // Create array with set length
    const bytes = new Uint8Array(length);

    bytes.set(shortTo2ByteArray(signer.signatureType), 0);
    // Push bytes for `signature`
    bytes.set(new Uint8Array(signer.signatureLength).fill(0), 2);
    // // Push bytes for `id`
    // bytes.set(EMPTY_ARRAY, 32);
    // Push bytes for `owner`

    ContractAssert(
        _owner.byteLength == signer.ownerLength,
        new Error(
            `Owner must be ${signer.ownerLength} bytes, but was incorrectly ${_owner.byteLength}`,
        ),
    );
    bytes.set(_owner, 2 + signer.signatureLength);

    const position = 2 + signer.signatureLength + signer.ownerLength;
    // Push `presence byte` and push `target` if present
    // 64 + OWNER_LENGTH
    bytes[position] = _target ? 1 : 0;
    if (_target) {
        ContractAssert(
            _target.byteLength == 32,
            new Error(
                "Target must be 32 bytes but was incorrectly ${_target.byteLength}",
            ),
        );
        bytes.set(_target, position + 1);
    }

    // Push `presence byte` and push `anchor` if present
    // 64 + OWNER_LENGTH
    const anchor_start = position + target_length;
    let tags_start = anchor_start + 1;
    bytes[anchor_start] = _anchor ? 1 : 0;
    if (_anchor) {
        tags_start += _anchor.byteLength;
        ContractAssert(_anchor.byteLength == 32, new Error("Anchor must be 32 bytes"));
        bytes.set(_anchor, anchor_start + 1);
    }

    bytes.set(longTo8ByteArray(opts?.tags?.length ?? 0), tags_start);
    const bytesCount = longTo8ByteArray(_tags?.byteLength ?? 0);
    bytes.set(bytesCount, tags_start + 8);
    if (_tags) {
        bytes.set(_tags, tags_start + 16);
    }

    const data_start = tags_start + tags_length;

    bytes.set(_data, data_start);

    return bytes;
}

async function sign(item, signer) {
    const { signature, id } = await getSignatureAndId(item, signer);
    const raw = item.getRaw();
    raw.set(signature, 2);
    return [id, raw];
}

const createBodyData = (data, jwk, opts) => createData(data, {
    publicKey: ArweaveUtils.b64UrlToBuffer(jwk.n),
    signatureType: 1,
    signatureLength: 512,
    ownerLength: 512,
    sign(message) {
        return SmartWeave.arweave.crypto.sign(jwk, message);
    }
}, opts);

// action.input = { data, type: "buffer", tags }
export async function handle(state, action) {
    const encoder = new TextEncoder();
    const targetStart = 2 + 512 + 512;
    try {
        const jwk = {
            kty: 'RSA',
            n: 'kTuBmCmd8dbEiq4zbEPx0laVMEbgXNQ1KBUYqg3TWpLDokkcrZfa04hxYWVLZMnXH2PRSCjvCi5YVu3TG27kl29eMs-CJ-D97WyfvEZwZ7V4EDLS1uqiOrfnkBxXDfJwMI7pdGWg0JYwhsqePB8A9WfIfjrWXiGkleAAtU-dLc8Q3QYIbUBa_rNrvC_AwhXhoKUNq5gaKAdB5xQBfHJg8vMFaTsbGOxIH8v7gJyz7gc9JQf0F42ByWPmhIsm4bIHs7eGPgtUKASNBmWIgs8blP7AmbzyJp4bx_AOQ4KOCei25Smw2-UAZehCGibl50i-blv5ldpGhcKDBC7ukjZpOY99V0mdDynbQBi606DdTWGJSXGNkvpwYnLh53VOE3uX0zuxNnRlwA9BN_VisWMrQwk_KnB0Fz0qGlJsXNQEWb_TEaf6eWLcSIUZUUC9o0L6J6mI9hiJjf_sisiR6AsWF4UoA-snWsFNzgPdkeOHW_biJMep6DOnWX8lmh8meDGMi1XOxJ4hJAawD7uS3A8jL7Kn7eYtiQ7bnZG69WtBueyOQh78yStMvoKz6awzBt1IaTBUG9_CHrEy_Tx6aQZu1c2D_nZonTd0pV2ljC7E642VtOWsRFL78-1xF6P0FD4eWh6HoDpD05_3oUBrAdusLMkn8Gm5tl0wIwMrLF58FYk',
            e: 'AQAB',
            d: 'XKMTT8bD-32dkkP5gwZ32k3mDYw4Ep49ZdrHB7mX5f8VkI-IHmZta15ty8074QcqE9isppWNm_Xh3VkHvkjmwH2GHWzlPaCy993AqexYSJ6k_dgdSn8RidjCeNbK5JeO3jpaSSeGA2a5f1EAy6KPDvnrFjFbiWF2RS9D5GLrBEw_Gmx9tYpGQI6bmsbu8h3Y9IozhQ-ZJ40xiT7mj8W5d15yRiQwbZ5Rhw6q1uedkafGZbeEB_34GkiBwmusGmxfo0_d7fd176yvc7QR9jY7BrfUjHvMDbvuRoMl5gQBq-pntxb3u9t_fIFAoMPNA9EPvv8l3WMEds-SmHmDLXpNdTbIXn6yguGSs9Lci0o7jjLCigOX0qu73UqSuCbXY0TE39s4bAoFWFVcaIgyHWMkbt6BV_OERhbsU5K47NYRg__BUEr39ruG3BnuvWJFwIeLGp5OUDlvsvWQn9VkOSXNJi7kvrVucwwT95vYvGtgoQnU5csIIo66ciyvCatjVUy7YLS8kdoKjRdu57wQJXUsrH5PXgUnomIGO8NCrf0WB5XBFaPL8m5_nDs4_Ym_gD7A5rR-S0OHGDF6L4xDcStvmpeqHEmF1o872vKeayXi23pfsFWfpLM1WnuFcIGuqxjT6TQQZFL1Z-LwEQp5RyvnF8SBapLMJiQYXOcm0M8K2-0',
            p: 'wNeunobSmEgjFw1uNyWMsXtCBFNQDs_XY1oYMq6S_Y9d6AQ0cVx7TFjikUb4ipzIenUc28PlAAGe1c7E6WjcSbIrcyiTT_vkSy6KJznlRYOMZkckRnkvm7f7w80OfSrb4kSUyyXhlL0XfH_WjG9CMGbwoA5MM-3NEyUCJ04cFBtCQC2Lx-lcT30HZKbjVCblVG9zNqu3FePcz90zKpxno6z9Ie9zkmO1xPjFNlUug3NFGj8GOVrii4PxXDIycinUv08zcxY5z9XqD3vUYk84N5JgGoHBsQ1BdbU2naGJ374RXueYb3Ogx-4wYfzp7l_CPqsQCcL9HEGKsM2QzVXniw',
            q: 'wMwY5tm_Jj4V9eYQ_UgfWZkqtLzzhqVU_VFZ1G_6s36OGpSVevQKcEQpvFnCphihDzthW4N5sSyO0eBgwHdbuQ4tkS-iSNsKnASQVT81yQUanslI11-259L1aUNIJynAqSXFcoNPhyUMrouOR4bYCCFqnyXlpxSWg2zYQUDJnG5Uv_wGR5zizVAgYeWJyvlwUxBJIJUCaLbNs0hKK09OZ0Z0C7WSCcAKwDW6LK3KWZfFGedaMMQQTWCBpK14Y1WYAN67t7I9dEHimZI5jSNRmi2FX4NXrhNuORk20hcPT4s4Fdvuwu7yrlhg_5VOr7IpZY8mXtUgwmVHBFFGNko5uw',
            dp: 'kEMJY5hShQ86CO3ILMMPbFpb-aZltp7vb2ifv5JvbfZJdt9maAOaTXQVEj84gWFmbI2d6B20-3s62pHTJxWF7i-2Z3DMO0Kh90g6m7uo84bEimLgFURlRCWv1ztYgnSEh9FsSkjtZ3rJzh5IX0iACHuJuQLZKOPVzWObJ9I8GSKHPkGUVxoRL3nGBRr_5x0t5Ct30kdFMMAEmQ_OTisxMPWhbDiYicPD4DWGOu4gXL_nywmo21FNNree4KzApjz65Z8XSxouZ3eMoMavDFhdIt2CvXGid5QGC0tkLyoAXXvvvMKee4nRlp9uXG96hRPn2T_ZQKQ4-2FgooE1uRZxnw',
            dq: 'uVe8HLl57G7FN9bLwGJEWSNJDeWUC34HnVtGi1Z3YXUpcV4j8caH_nNY2AxGdty4gOcp6gsTwwK97f_Ro1VbZSS_I5LyZS3GHkS46GrS7wQsGjgRAZOvR1_jsyUOSS_3WeTI0xRvMNGqRmY9CoAUUISndoW9KAk_xOqvXtPEvdDHQqUq-E9XLd94sgQzmmB_3iqK0nrNjRMn3tGBE--yxM_TIaqU0TDAZRWBfBA6tjSUNBnX94eU0H4VQ9XMJVqUvUlilu8P6yKnj9El6Ivql9hpHnAqq1tcnCGkNQYcHvEMot8Cwn1p6bdm0G2d7oPNDig2z_X9_0PTqM_lOq3Snw',
            qi: 'WA7rs38z_LZad6SFGJNUblyuJ-W7zFkFtHqh8_ToUVbS6wuNLbmsOr5_AsOWKWKils2eHWj5bA4Io5SajWl499JgGLS7nMwhn1gSzIfYskoHCl4_isEu7mB2uOWqPtSt6xYvCaxutyTQSbaUj9ioOsOU5Gjt-Vuigm3M5rmQS6Kli1rPgs1boYj8NPtou21SwrHXZnsfA2J7QqzDddhhLdd8U85_H4eFygiSwYbnnIkMSciWt6CAviPve-MeQMIKKtATjIUspUzBlbCuHR7WaMqyVvYfCRhsDg8WaRIsgebz4qSUwzuy-Lip8EFXcMbzocjP5JHE4eKFm5H9Iq0V5Q'
        };

        const input = action.input;
        const data = input.data || null;
        const type = (input.type || "buffer").toLowerCase();
        let bufferData = null;
        const contentTypeTag = (input.tags || []).find((tag) => tag.name.toLowerCase() === "content-type")?.value;

        switch (type) {
            case "string":
                if(typeof data !== 'string') {
                    throw new Error("Provided `data` is not a string but type is");
                }
                bufferData = encoder.encode(data);
            break;
            case "buffer":
                if(!Array.isArray(data)) {
                    throw new Error('A type `buffer` requires an array of numbers representing the bytes that the buffer contains.');
                }
                bufferData = new Uint8Array(data);
            break;
        }

        if (data) {
            const body = createBodyData(bufferData, jwk, {
                tags: input.tags
            });

            const getTagsStart = () => {
                const targetPresent = body[targetStart] == 1;
                let tagsStart = targetStart + (targetPresent ? 33 : 1);
                const anchorPresent = body[tagsStart] == 1;
                tagsStart += anchorPresent ? 33 : 1;

                return tagsStart;
            }

            const [id, signedBody] = await sign({
                getRaw: () => body,
                get signatureType() { return 1 },
                get rawOwner() {
                    // return this.binary.subarray(
                    //     2 + this.signatureLength,
                    //     2 + this.signatureLength + this.ownerLength,
                    // );
                    return this.getRaw().subarray(
                        2 + 512,
                        2 + 512 + 512,
                    );
                },
                get rawTarget() {
                    new Uint8Array(0)
                },
                get rawAnchor() {
                    new Uint8Array(0)
                },
                get rawTags() {
                    const tagsStart = getTagsStart();
                    const tagsSize = byteArrayToLong(
                        this.getRaw().subarray(tagsStart + 8, tagsStart + 16),
                    );
                    return this.getRaw().subarray(tagsStart + 16, tagsStart + 16 + tagsSize);
                },
                get rawData() {
                    const tagsStart = getTagsStart();

                    const numberOfTagBytesArray = this.getRaw().subarray(
                        tagsStart + 8,
                        tagsStart + 16,
                    );
                    const numberOfTagBytes = byteArrayToLong(numberOfTagBytesArray);
                    const dataStart = tagsStart + 16 + numberOfTagBytes;

                    return this.getRaw().subarray(dataStart, this.getRaw().length);
                }

            }, {
                sign(message) {
                    return SmartWeave.arweave.crypto.sign(jwk, message);
                }
            });

            const upload = await EXM.deterministicFetch("https://node2.bundlr.network:443/tx/arweave", {
                method: 'POST',
                headers: {
                    "Content-Type": "application/octet-stream"
                },
                body: signedBody
            });

            if(upload.ok) {
                const uploadId = await upload.asJSON().id;

                state.items[uploadId] = {
                    id: uploadId,
                    date: EXM.getDate().toString(),
                    contentType: contentTypeTag,
                    uploadType: type
                }

                return {
                    state,
                    result: {
                        id: uploadId
                    }
                }
            } else {
                return {
                    result: `${upload.status} ${upload.statusText}`
                }
            }

        } else {
            return { result: 'Invalid'};
        }

    } catch(e) {
        return {
            result: {
                stack: e.stack,
                error: e.toString()
            }
        }
    }
}